import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { fakeIntervals } from "./support/fake-intervals.js";
import { openSession } from "./support/mcp-session.js";
import { VALID_CREATE_ARGS } from "./support/valid-args.js";

const LATER = "2026-10-21";

const SKILL = readFileSync(
  new URL("../../skills/intervals-icu-workouts/SKILL.md", import.meta.url),
  "utf8",
);

const CREATE_STEP = SKILL.split("### 2. Create")[1]?.split("### 3.")[0];

const READ_BACK_STEP = SKILL.split("### 4. Read back")[1]?.split("## Writing a cycling workout")[0];

describe("a create call whose arguments break the input schema", () => {
  it.each([
    [
      "create_strength_workout",
      "durationMinutes",
      { ...VALID_CREATE_ARGS.strength(LATER), durationMinutes: 1.5 },
    ],
    ["create_cycling_workout", "date", { ...VALID_CREATE_ARGS.cycling(LATER), date: 20261021 }],
  ] as const)(
    "%s answers with a plain-text error naming %s, as the create step of the skill says",
    async (tool, field, args) => {
      const intervals = fakeIntervals();
      const { isError, reply } = await (await openSession({ intervals })).call(tool, args);
      expect(isError).toBe(true);
      expect(reply["status"]).toBeUndefined();
      expect(reply["sdkMessage"]).toContain(`${field}: `);
      expect(intervals.requests).toEqual([]);
      expect(CREATE_STEP).not.toMatch(/every reply is JSON/i);
      expect(CREATE_STEP).toMatch(/plain-text error that names the field/);
    },
  );
});

describe("a get_workout call whose arguments break the input schema", () => {
  it.each([
    ["a string eventId", "123"],
    ["a non-positive eventId", 0],
  ] as const)(
    "answers %s with a plain-text error naming eventId, as the read-back step of the skill says",
    async (_label, eventId) => {
      const intervals = fakeIntervals();
      const { isError, reply } = await (
        await openSession({ intervals })
      ).call("get_workout", { eventId });
      expect(isError).toBe(true);
      expect(reply["status"]).toBeUndefined();
      expect(reply["next"]).toBeUndefined();
      expect(reply["sdkMessage"]).toContain("eventId: ");
      expect(intervals.requests).toEqual([]);
      expect(READ_BACK_STEP).toMatch(/plain-text error that names the field/);
    },
  );
});
