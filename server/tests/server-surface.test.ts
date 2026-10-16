import { describe, expect, it } from "vitest";
import { TOOL_NAMES } from "../src/coach-server.js";
import { SPORTS } from "../src/workout-kinds.js";
import {
  BAD_GATEWAY,
  FORBIDDEN,
  RATE_LIMIT,
  TIMEOUT,
  fakeIntervals,
  type FakeEvent,
} from "./support/fake-intervals.js";
import { openSession } from "./support/mcp-session.js";
import { VALID_CREATE_ARGS } from "./support/valid-args.js";

const LATER = "2026-10-21";

describe("tools/list", () => {
  it("lists exactly create_cycling_workout, create_strength_workout and get_workout, each with a strict object schema", async () => {
    const tools = await (await openSession({ intervals: undefined })).listTools();
    expect(tools.map((tool) => tool.name).toSorted()).toEqual(TOOL_NAMES.toSorted());
    expect(TOOL_NAMES.toSorted()).toEqual([
      "create_cycling_workout",
      "create_strength_workout",
      "get_workout",
    ]);
    for (const tool of tools) {
      expect(tool.inputSchema).toMatchObject({ type: "object", additionalProperties: false });
    }
  });

  it("names every sport of the registry in the server instructions", async () => {
    const session = await openSession({ intervals: undefined });
    for (const sport of SPORTS) expect(session.instructions).toContain(sport);
  });
});

describe("create_cycling_workout", () => {
  it("answers invalid_workout listing every bad step path, without any request", async () => {
    const intervals = fakeIntervals();
    const session = await openSession({ intervals });
    const { isError, reply } = await session.call("create_cycling_workout", {
      date: LATER,
      name: "Broken",
      steps: [
        {
          type: "ramp",
          duration: { value: 10, unit: "minutes" },
          power: { kind: "percent_ftp", value: 60 },
        },
        { type: "steady", duration: { value: 20, unit: "minutes" } },
      ],
    });
    expect(isError).toBe(true);
    expect(reply).toMatchObject({ status: "refused", code: "invalid_workout", saved: "no" });
    expect(reply["details"]).toBe(
      "steps[0]: ramp requires power.low and power.high; steps[1]: steady step requires a power target",
    );
    expect(intervals.requests).toEqual([]);
  });

  it("answers invalid_workout naming a label intervals.icu would read as a target, without any request", async () => {
    const intervals = fakeIntervals();
    const session = await openSession({ intervals });
    const valid = VALID_CREATE_ARGS.cycling(LATER);
    const { reply } = await session.call("create_cycling_workout", {
      ...valid,
      steps: [
        {
          type: "steady",
          duration: { value: 20, unit: "minutes" },
          power: { kind: "percent_ftp", value: 70 },
          label: "HR check",
        },
      ],
    });
    expect(reply).toMatchObject({ status: "refused", code: "invalid_workout", saved: "no" });
    expect(reply["details"]).toMatch(/^steps\[0\]\.label: /);
    expect(intervals.requests).toEqual([]);
  });

  it("sends a Ride with the serialized description and its moving time", async () => {
    const intervals = fakeIntervals();
    await (
      await openSession({ intervals })
    ).call("create_cycling_workout", VALID_CREATE_ARGS.cycling(LATER));
    expect(intervals.sent[0]).toMatchObject({
      type: "Ride",
      description:
        "Warmup\n- 10m 50-70%\n\nMain set 3x\n- 15m 88-94%\n- 5m 50%\n\nCooldown\n- 10m 45%",
      movingTime: 80 * 60,
      externalId: `enduragent-coach:${LATER}:cycling-sweet-spot-3x15`,
    });
  });

  it("refuses a label with a paragraph separator and writes nothing", async () => {
    const intervals = fakeIntervals();
    const { isError } = await (
      await openSession({ intervals })
    ).call("create_cycling_workout", {
      date: LATER,
      name: "Endurance",
      steps: [
        {
          type: "steady",
          duration: { value: 20, unit: "minutes" },
          power: { kind: "percent_ftp", value: 70 },
          label: "easy\u2029spin",
        },
      ],
    });
    expect(isError).toBe(true);
    expect(intervals.sent).toEqual([]);
    expect(intervals.calendar).toEqual([]);
  });
});

describe("create_strength_workout", () => {
  it("sends WeightTraining with the description as given and durationMinutes as moving time", async () => {
    const intervals = fakeIntervals();
    await (
      await openSession({ intervals })
    ).call("create_strength_workout", VALID_CREATE_ARGS.strength(LATER));
    expect(intervals.sent[0]).toMatchObject({
      type: "WeightTraining",
      description: "Back squat 4x6 @ effort 7, rest 2 min\nRomanian deadlift 3x8 @ effort 6",
      movingTime: 45 * 60,
      externalId: `enduragent-coach:${LATER}:strength-lower-body-45min`,
    });
  });

  it.each([0, 1.5, 601])(
    "rejects durationMinutes %j through the schema",
    async (durationMinutes) => {
      const intervals = fakeIntervals();
      const { isError } = await (
        await openSession({ intervals })
      ).call("create_strength_workout", {
        ...VALID_CREATE_ARGS.strength(LATER),
        durationMinutes,
      });
      expect(isError).toBe(true);
      expect(intervals.requests).toEqual([]);
    },
  );
});

const STORED_RIDE: FakeEvent = {
  id: 4401,
  startDateLocal: `${LATER}T00:00:00`,
  category: "WORKOUT",
  type: "Ride",
  name: "Sweet Spot 3x15",
  description: "Warmup\r\n- 10m 50-70%",
  movingTime: 4800,
  icuTrainingLoad: 92,
  workoutDoc: { steps: [{ duration: 600 }] },
  tags: ["enduragent-coach"],
  externalId: `enduragent-coach:${LATER}:cycling-sweet-spot-3x15`,
};

describe("get_workout", () => {
  it("returns the stored description with CRLF turned into LF, moving time, load and whether the chart renders", async () => {
    const session = await openSession({ intervals: fakeIntervals({ events: [STORED_RIDE] }) });
    const { isError, reply } = await session.call("get_workout", { eventId: 4401 });
    expect(isError).toBe(false);
    expect(reply["saved"]).toBeUndefined();
    expect(reply).toMatchObject({
      status: "found",
      workout: {
        eventId: 4401,
        date: LATER,
        category: "WORKOUT",
        type: "Ride",
        description: "Warmup\n- 10m 50-70%",
        movingTimeSeconds: 4800,
        load: 92,
        hasStructuredSteps: true,
        chartWillRender: true,
        isPluginWorkout: true,
      },
    });
  });

  it("reports chartWillRender false for a ride intervals.icu did not parse, and null for strength", async () => {
    const session = await openSession({
      intervals: fakeIntervals({
        events: [
          { ...STORED_RIDE, id: 1, workoutDoc: { steps: [] } },
          {
            id: 2,
            startDateLocal: `${LATER}T00:00:00`,
            category: "WORKOUT",
            type: "WeightTraining",
            name: "Gym",
          },
        ],
      }),
    });
    expect((await session.call("get_workout", { eventId: 1 })).reply).toMatchObject({
      workout: { hasStructuredSteps: false, chartWillRender: false },
    });
    expect((await session.call("get_workout", { eventId: 2 })).reply).toMatchObject({
      workout: { chartWillRender: null, isPluginWorkout: false, description: null },
    });
  });

  it("marks a workout as a plugin workout by its external id prefix alone", async () => {
    const session = await openSession({
      intervals: fakeIntervals({ events: [{ ...STORED_RIDE, tags: null }] }),
    });
    expect((await session.call("get_workout", { eventId: 4401 })).reply).toMatchObject({
      workout: { isPluginWorkout: true },
    });
  });

  it("answers not_found for an unknown eventId", async () => {
    const { isError, reply } = await (
      await openSession({ intervals: fakeIntervals() })
    ).call("get_workout", { eventId: 77 });
    expect(isError).toBe(true);
    expect(reply).toMatchObject({ status: "refused", code: "not_found" });
    expect(reply["saved"]).toBeUndefined();
  });

  it("answers intervals_unavailable when the stored event does not parse", async () => {
    const session = await openSession({
      intervals: fakeIntervals({ getBody: { id: "not-a-number" } }),
    });
    expect((await session.call("get_workout", { eventId: 1 })).reply).toMatchObject({
      status: "refused",
      code: "intervals_unavailable",
    });
  });

  it.each([
    [FORBIDDEN, "forbidden"],
    [BAD_GATEWAY, "intervals_unavailable"],
  ] as const)("maps a failed read to %s", async (getError, code) => {
    const session = await openSession({ intervals: fakeIntervals({ getError }) });
    expect((await session.call("get_workout", { eventId: 1 })).reply).toMatchObject({ code });
  });

  it.each([
    ["a rate limit", { getError: RATE_LIMIT }, "rate_limited"],
    ["a 502", { getError: BAD_GATEWAY }, "intervals_unavailable"],
    ["a timeout", { getError: TIMEOUT }, "intervals_unavailable"],
    ["an unexpected shape", { getBody: { id: "not-a-number" } }, "intervals_unavailable"],
  ] as const)(
    "never claims anything about saving when the read-back after a create fails with %s",
    async (_label, failure, code) => {
      const session = await openSession({ intervals: fakeIntervals(failure) });
      const created = await session.call(
        "create_strength_workout",
        VALID_CREATE_ARGS.strength(LATER),
      );
      expect(created.reply).toMatchObject({ status: "created", saved: "yes" });
      const { isError, reply } = await session.call("get_workout", {
        eventId: created.reply["eventId"],
      });
      expect(isError).toBe(true);
      expect(reply).toMatchObject({ status: "refused", code });
      expect(reply["saved"]).toBeUndefined();
      expect(reply["next"]).toContain("get_workout");
      expect(reply["next"]).not.toMatch(/saved/i);
    },
  );

  it("answers not_configured when INTERVALS_API_KEY is missing", async () => {
    const session = await openSession({ intervals: undefined });
    expect((await session.call("get_workout", { eventId: 1 })).reply).toMatchObject({
      status: "refused",
      code: "not_configured",
    });
  });
});
