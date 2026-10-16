import { describe, expect, it } from "vitest";
import { WORKOUT_KINDS } from "../src/workout-kinds.js";
import {
  BAD_GATEWAY,
  BAD_REQUEST,
  FORBIDDEN,
  NOT_FOUND,
  RATE_LIMIT,
  TIMEOUT,
  UNAUTHORIZED,
  fakeIntervals,
  type CreateFailure,
} from "./support/fake-intervals.js";
import { openSession } from "./support/mcp-session.js";
import { VALID_CREATE_ARGS } from "./support/valid-args.js";

const LOS_ANGELES_TODAY = "2026-10-19";
const ALMATY_TODAY = "2026-10-20";
const LATER = "2026-10-21";

describe.each(WORKOUT_KINDS)("$name", (kind) => {
  const args = VALID_CREATE_ARGS[kind.sport];
  const name = String(args(LATER)["name"]);

  it("saves a workout dated today in the athlete's time zone, tagged and with a day-unique external id", async () => {
    const intervals = fakeIntervals({ timezone: "America/Los_Angeles" });
    const session = await openSession({ intervals });
    const { isError, reply } = await session.call(kind.name, args(LOS_ANGELES_TODAY));
    expect({ isError, status: reply["status"], saved: reply["saved"] }).toEqual({
      isError: false,
      status: "created",
      saved: "yes",
    });
    expect(reply).toMatchObject({
      tool: kind.name,
      date: LOS_ANGELES_TODAY,
      name,
      recovered: false,
    });
    expect(reply["next"]).toContain("get_workout");
    expect(intervals.sent).toHaveLength(1);
    expect(intervals.sent[0]).toMatchObject({
      startDateLocal: `${LOS_ANGELES_TODAY}T00:00:00`,
      category: "WORKOUT",
      name,
      tags: ["enduragent-coach"],
      externalId: expect.stringMatching(
        new RegExp(`^enduragent-coach:${LOS_ANGELES_TODAY}:${kind.sport}-[a-z0-9-]+$`),
      ),
    });
    expect(Number.isInteger(intervals.sent[0]?.movingTime)).toBe(true);
    expect(reply["eventId"]).toBe(intervals.calendar[0]?.id);
  });

  it("refuses the same date as past when the athlete's time zone is already on the next day", async () => {
    const intervals = fakeIntervals({ timezone: "Asia/Almaty" });
    const session = await openSession({ intervals });
    const { isError, reply } = await session.call(kind.name, args(LOS_ANGELES_TODAY));
    expect(isError).toBe(true);
    expect(reply).toMatchObject({ status: "refused", code: "past_date_refused", saved: "no" });
    expect(reply["details"]).toContain(ALMATY_TODAY);
    expect(intervals.sent).toEqual([]);
  });

  it("answers invalid_date for 2026-02-30 without any request to intervals.icu", async () => {
    const intervals = fakeIntervals();
    const session = await openSession({ intervals });
    const { reply } = await session.call(kind.name, args("2026-02-30"));
    expect(reply).toMatchObject({ status: "refused", code: "invalid_date", saved: "no" });
    expect(intervals.requests).toEqual([]);
  });

  it.each([null, "", "   ", "Mars/Olympus_Mons"])(
    "answers timezone_missing when Athlete.timezone is %j",
    async (timezone) => {
      const intervals = fakeIntervals({ timezone });
      const session = await openSession({ intervals });
      const { reply } = await session.call(kind.name, args(LATER));
      expect(reply).toMatchObject({ status: "refused", code: "timezone_missing", saved: "no" });
      expect(intervals.sent).toEqual([]);
    },
  );

  it("answers duplicate_found with the existing workout when the day has the same name from any source, ignoring case and spacing", async () => {
    const intervals = fakeIntervals({
      events: [
        {
          id: 812,
          startDateLocal: `${LATER}T00:00:00`,
          category: "WORKOUT",
          type: "Run",
          name: `  ${name.toUpperCase().replace(" ", "   ")} `,
        },
        { id: 813, startDateLocal: `${ALMATY_TODAY}T00:00:00`, category: "WORKOUT", name },
      ],
    });
    const session = await openSession({ intervals });
    const { isError, reply } = await session.call(kind.name, args(LATER));
    expect(isError).toBe(false);
    expect(reply).toMatchObject({
      status: "duplicate_found",
      saved: "no",
      tool: kind.name,
      date: LATER,
      existing: [{ eventId: 812, type: "Run", externalId: null, isPluginWorkout: false }],
    });
    expect(reply["next"]).toContain("confirmDuplicate: true");
    expect(intervals.sent).toEqual([]);
  });

  it("answers duplicate_found for a blind retry of a create that already landed, and saves confirmed duplicates with the next free suffix", async () => {
    const intervals = fakeIntervals();
    const session = await openSession({ intervals });
    const first = (await session.call(kind.name, args(LATER))).reply;
    const retry = (await session.call(kind.name, args(LATER))).reply;
    expect(retry).toMatchObject({
      status: "duplicate_found",
      existing: [
        { eventId: first["eventId"], externalId: first["externalId"], isPluginWorkout: true },
      ],
    });
    const second = (await session.call(kind.name, { ...args(LATER), confirmDuplicate: true }))
      .reply;
    const third = (await session.call(kind.name, { ...args(LATER), confirmDuplicate: true })).reply;
    expect(second).toMatchObject({
      status: "created",
      externalId: `${String(first["externalId"])}-2`,
    });
    expect(third).toMatchObject({
      status: "created",
      externalId: `${String(first["externalId"])}-3`,
    });
    expect(intervals.calendar).toHaveLength(3);
  });

  it("answers not_configured when INTERVALS_API_KEY is missing", async () => {
    const session = await openSession({ intervals: undefined });
    const { isError, reply } = await session.call(kind.name, args(LATER));
    expect(isError).toBe(true);
    expect(reply).toMatchObject({ status: "refused", code: "not_configured", saved: "no" });
    expect(reply["next"]).toContain("INTERVALS_API_KEY");
  });

  it.each([
    ["a rejected key", UNAUTHORIZED, "unauthorized"],
    ["a 404", NOT_FOUND, "intervals_unavailable"],
    ["a timeout", TIMEOUT, "intervals_unavailable"],
  ] as const)("maps %s on the athlete read to %s", async (_label, athleteError, code) => {
    const intervals = fakeIntervals({ athleteError });
    const session = await openSession({ intervals });
    const { reply } = await session.call(kind.name, args(LATER));
    expect(reply).toMatchObject({ status: "refused", code, saved: "no" });
    expect(intervals.sent).toEqual([]);
  });

  it("maps a rate limit on the day read to rate_limited with retryAfterSeconds", async () => {
    const intervals = fakeIntervals({ listError: RATE_LIMIT });
    const session = await openSession({ intervals });
    const { reply } = await session.call(kind.name, args(LATER));
    expect(reply).toMatchObject({ status: "refused", code: "rate_limited", retryAfterSeconds: 5 });
    expect(intervals.sent).toEqual([]);
  });

  it.each([
    ["Unauthorized", UNAUTHORIZED, "unauthorized"],
    ["Forbidden", FORBIDDEN, "forbidden"],
    ["RateLimit", RATE_LIMIT, "rate_limited"],
    ["NotFound", NOT_FOUND, "rejected"],
    ["Http 400", BAD_REQUEST, "rejected"],
  ] as const)("refuses with nothing written for %s on the write", async (_label, error, code) => {
    const intervals = fakeIntervals({ createFailure: { error, lands: false } });
    const session = await openSession({ intervals });
    const { isError, reply } = await session.call(kind.name, args(LATER));
    expect(isError).toBe(true);
    expect(reply).toMatchObject({ status: "refused", code, saved: "no" });
    expect(intervals.requests.filter((request) => request === "events.list")).toHaveLength(1);
  });

  it.each<[string, CreateFailure]>([
    ["timed out", { error: TIMEOUT, lands: true }],
    ["came back 502", { error: BAD_GATEWAY, lands: true }],
    ["threw", { throws: true, lands: true }],
  ])(
    "reports created with recovered: true when the write %s but the event is on the day",
    async (_label, createFailure) => {
      const intervals = fakeIntervals({ createFailure });
      const session = await openSession({ intervals });
      const { isError, reply } = await session.call(kind.name, args(LATER));
      expect(isError).toBe(false);
      expect(reply).toMatchObject({
        status: "created",
        saved: "yes",
        recovered: true,
        eventId: intervals.calendar[0]?.id,
      });
    },
  );

  it.each<[string, CreateFailure]>([
    ["timed out", { error: TIMEOUT, lands: false }],
    ["threw", { throws: true, lands: false }],
  ])(
    "reports uncertain with the attempted external id when the write %s and the re-read finds nothing",
    async (_label, createFailure) => {
      const intervals = fakeIntervals({ createFailure });
      const session = await openSession({ intervals });
      const { isError, reply } = await session.call(kind.name, args(LATER));
      expect(isError).toBe(true);
      expect(reply).toMatchObject({
        status: "uncertain",
        saved: "unknown",
        externalId: intervals.sent[0]?.externalId,
        confirmDuplicate: false,
      });
      expect(reply["next"]).toContain("Do not call");
      expect(reply["next"]).not.toContain("confirmDuplicate: true");
    },
  );

  it.each([
    ["landed", true, "lists"],
    ["did not land", false, "does not list"],
  ] as const)(
    "answers uncertain for a confirmed duplicate whose write %s, and next reads the plain retry correctly",
    async (_label, lands, retryOutcome) => {
      const intervals = fakeIntervals({
        events: [{ id: 812, startDateLocal: `${LATER}T00:00:00`, category: "WORKOUT", name }],
        createFailure: { error: TIMEOUT, lands },
        recoveryListError: BAD_GATEWAY,
      });
      const session = await openSession({ intervals });
      const { reply } = await session.call(kind.name, { ...args(LATER), confirmDuplicate: true });
      const attempted = intervals.sent[0]?.externalId;
      expect(reply).toMatchObject({
        status: "uncertain",
        saved: "unknown",
        externalId: attempted,
        confirmDuplicate: true,
      });
      const next = String(reply["next"]);
      expect(next).toContain(`listing externalId ${String(attempted)} means it was saved`);
      expect(next).toContain(`does not list ${String(attempted)} means it was not saved`);
      expect(next).toContain("confirmDuplicate: true");
      const retry = (await session.call(kind.name, args(LATER))).reply;
      expect(retry["status"]).toBe("duplicate_found");
      const listsAttempted = JSON.stringify(retry["existing"]).includes(String(attempted));
      expect(listsAttempted ? "lists" : "does not list").toBe(retryOutcome);
    },
  );

  it("reports uncertain when the write landed but the re-read fails", async () => {
    const intervals = fakeIntervals({
      createFailure: { error: TIMEOUT, lands: true },
      recoveryListError: BAD_GATEWAY,
    });
    const session = await openSession({ intervals });
    const { reply } = await session.call(kind.name, args(LATER));
    expect(reply).toMatchObject({ status: "uncertain", saved: "unknown" });
  });

  it("reports created after a re-read when intervals.icu answers 2xx without an event id", async () => {
    const intervals = fakeIntervals({ createdBody: { ok: true } });
    const session = await openSession({ intervals });
    const { reply } = await session.call(kind.name, args(LATER));
    expect(reply).toMatchObject({
      status: "created",
      recovered: true,
      eventId: intervals.calendar[0]?.id,
    });
  });

  it("never echoes the error body beyond its short message", async () => {
    const rejected = await (
      await openSession({
        intervals: fakeIntervals({ createFailure: { error: BAD_REQUEST, lands: false } }),
      })
    ).call(kind.name, args(LATER));
    expect(rejected.reply["details"]).toContain("name too long");
    expect(JSON.stringify(rejected.reply)).not.toContain("internal stack frame");
    const unknown = await (
      await openSession({
        intervals: fakeIntervals({ createFailure: { error: BAD_GATEWAY, lands: false } }),
      })
    ).call(kind.name, args(LATER));
    expect(unknown.reply["details"]).toContain("502");
    expect(JSON.stringify(unknown.reply)).not.toContain("10.0.0.7");
  });

  it("rejects an unknown argument and a name with a line break through the SDK's input validation", async () => {
    const intervals = fakeIntervals();
    const session = await openSession({ intervals });
    const unknownKey = await session.call(kind.name, { ...args(LATER), indoor: true });
    const lineBreak = await session.call(kind.name, { ...args(LATER), name: "Easy\nZ2" });
    const badDate = await session.call(kind.name, { ...args(LATER), date: "2026/10/21" });
    for (const call of [unknownKey, lineBreak, badDate]) {
      expect(call.isError).toBe(true);
      expect(call.reply["sdkMessage"]).toContain("Input validation error");
    }
    expect(intervals.requests).toEqual([]);
  });

  it("trims the name before saving and comparing", async () => {
    const intervals = fakeIntervals();
    const session = await openSession({ intervals });
    await session.call(kind.name, { ...args(LATER), name: `  ${name}  ` });
    expect(intervals.sent[0]?.name).toBe(name);
  });
});
