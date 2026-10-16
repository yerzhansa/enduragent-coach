import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { fakeIntervals } from "./support/fake-intervals.js";
import { openSession } from "./support/mcp-session.js";
import { VALID_CREATE_ARGS } from "./support/valid-args.js";

const LATER = "2026-10-21";

const CREATE_STEP = readFileSync(
  new URL("../../skills/intervals-icu-workouts/SKILL.md", import.meta.url),
  "utf8",
)
  .split("### 2. Create")[1]
  ?.split("### 3.")[0];

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
