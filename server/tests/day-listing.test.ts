import { describe, expect, it } from "vitest";
import { TIMEOUT, fakeIntervals } from "./support/fake-intervals.js";
import { openSession } from "./support/mcp-session.js";
import { VALID_CREATE_ARGS } from "./support/valid-args.js";

const LATER = "2026-10-21";
const args = VALID_CREATE_ARGS.strength(LATER);
const name = String(args["name"]);
const baseExternalId = `enduragent-coach:${LATER}:strength-lower-body-45min`;

describe("a day listing with oddly shaped entries", () => {
  it("still answers duplicate_found listing the same-name workouts", async () => {
    const intervals = fakeIntervals({
      events: [{ id: 812, startDateLocal: `${LATER}T00:00:00`, category: "WORKOUT", name }],
      oddDayEntries: [
        { id: 813, startDateLocal: `${LATER}T00:00:00`, name: "No category" },
        { id: 814, category: "WORKOUT", name, tags: [7, "enduragent-coach"] },
        { id: 815, startDateLocal: `${LATER}T00:00:00`, category: "WORKOUT", name: null },
      ],
    });
    const session = await openSession({ intervals });
    const { reply } = await session.call("create_strength_workout", args);
    expect(reply).toMatchObject({ status: "duplicate_found", saved: "no" });
    expect(reply["existing"]).toEqual([
      { eventId: 812, name, type: null, externalId: null, isPluginWorkout: false },
      { eventId: 814, name, type: null, externalId: null, isPluginWorkout: true },
    ]);
    expect(intervals.sent).toEqual([]);
  });

  it("saves around the external ids that malformed entries already hold", async () => {
    const intervals = fakeIntervals({
      oddDayEntries: [
        { id: 900, name: 42, externalId: baseExternalId },
        { id: "not-a-number", externalId: `${baseExternalId}-2` },
        null,
      ],
    });
    const session = await openSession({ intervals });
    const { reply } = await session.call("create_strength_workout", args);
    expect(reply).toMatchObject({ status: "created", externalId: `${baseExternalId}-3` });
    expect(intervals.sent.map((event) => event.externalId)).toEqual([`${baseExternalId}-3`]);
  });

  it("recovers a write that timed out but landed", async () => {
    const intervals = fakeIntervals({
      createFailure: { error: TIMEOUT, lands: true },
      oddDayEntries: [{ id: 900, category: 3 }],
    });
    const session = await openSession({ intervals });
    const { reply } = await session.call("create_strength_workout", args);
    expect(reply).toMatchObject({
      status: "created",
      recovered: true,
      eventId: intervals.calendar[0]?.id,
    });
  });
});
