import { describe, expect, it } from "vitest";
import { fakeIntervals } from "./support/fake-intervals.js";
import { openSession } from "./support/mcp-session.js";
import { VALID_CREATE_ARGS } from "./support/valid-args.js";

const LATER = "2026-10-21";
const DAY_AFTER = "2026-10-22";
const strength = VALID_CREATE_ARGS.strength;
const byText = (a: string, b: string): number => a.localeCompare(b);

describe("concurrent creates", () => {
  it("saves one of three identical same-day creates sent at once and answers duplicate_found to the others", async () => {
    const intervals = fakeIntervals();
    const session = await openSession({ intervals });
    const replies = await Promise.all(
      [1, 2, 3].map(
        async () => (await session.call("create_strength_workout", strength(LATER))).reply,
      ),
    );
    expect(replies.map((reply) => String(reply["status"])).toSorted(byText)).toEqual([
      "created",
      "duplicate_found",
      "duplicate_found",
    ]);
    expect(intervals.calendar).toHaveLength(1);
  });

  it("gives two confirmed duplicates sent at once distinct external ids", async () => {
    const intervals = fakeIntervals();
    const session = await openSession({ intervals });
    const first = (await session.call("create_strength_workout", strength(LATER))).reply;
    const confirmed = { ...strength(LATER), confirmDuplicate: true };
    const replies = await Promise.all([
      session.call("create_strength_workout", confirmed),
      session.call("create_strength_workout", confirmed),
    ]);
    expect(replies.map(({ reply }) => reply["status"])).toEqual(["created", "created"]);
    expect(replies.map(({ reply }) => String(reply["externalId"])).toSorted(byText)).toEqual([
      `${String(first["externalId"])}-2`,
      `${String(first["externalId"])}-3`,
    ]);
    expect(new Set(intervals.calendar.map((event) => event.externalId)).size).toBe(3);
  });

  it("keeps creates on different days in flight together", async () => {
    const intervals = fakeIntervals({ holdCreatesUntil: 2 });
    const session = await openSession({ intervals });
    const replies = await Promise.all([
      session.call("create_strength_workout", strength(LATER)),
      session.call("create_strength_workout", strength(DAY_AFTER)),
    ]);
    expect(replies.map(({ reply }) => reply["status"])).toEqual(["created", "created"]);
  });
});
