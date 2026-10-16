import { describe, expect, it } from "vitest";
import { cyclingStepsField } from "../src/cycling-steps.js";
import { formatted, issues } from "./support/cycling.js";

const minutes = (value: number) => ({ value, unit: "minutes" as const });

describe("formatCyclingSteps rules", () => {
  it("rejects a ramp without power.low and power.high, for percent and zone targets", () => {
    expect(
      issues([{ type: "ramp", duration: minutes(10), power: { kind: "percent_ftp", value: 70 } }]),
    ).toBe("steps[0]: ramp requires power.low and power.high");
    expect(
      issues([{ type: "ramp", duration: minutes(10), power: { kind: "zone", value: 2 } }]),
    ).toMatch(/ramp requires power\.low and power\.high/);
  });

  it("requires a power target on every step except freeride and rest", () => {
    expect(issues([{ type: "ramp", duration: minutes(10) }])).toBe(
      "steps[0]: ramp step requires a power target",
    );
    expect(issues([{ type: "steady", duration: minutes(30) }])).toBe(
      "steps[0]: steady step requires a power target",
    );
    expect(
      formatted([
        { type: "rest", duration: minutes(5) },
        { type: "freeride", duration: minutes(20) },
      ]).description,
    ).toBe("Main set\n- 5m\n- 20m");
  });

  it("lists every bad step path, including inside sets", () => {
    const details = issues([
      { type: "ramp", duration: minutes(10), power: { kind: "percent_ftp", value: 60 } },
      {
        type: "set",
        repeat: 2,
        interval: { type: "interval", duration: minutes(3) },
        recovery: { type: "recovery", duration: minutes(2), power: { kind: "zone", value: 9 } },
      },
    ]);
    expect(details.split("; ")).toEqual([
      "steps[0]: ramp requires power.low and power.high",
      "steps[1].interval: interval step requires a power target",
      "steps[1].recovery.power.value: zone must be an integer 1-7, got 9",
    ]);
  });

  it("rejects zone values outside 1-7, on single targets and ramps", () => {
    expect(
      issues([{ type: "steady", duration: minutes(30), power: { kind: "zone", value: 8 } }]),
    ).toMatch(/zone must be an integer/);
    expect(
      issues([{ type: "ramp", duration: minutes(10), power: { kind: "zone", low: 1, high: 8 } }]),
    ).toMatch(/zone must be an integer/);
    expect(
      issues([{ type: "steady", duration: minutes(10), power: { kind: "zone", value: 2.5 } }]),
    ).toMatch(/zone must be an integer/);
  });

  it("rejects an inverted zone ramp and an inverted power range", () => {
    expect(
      issues([{ type: "ramp", duration: minutes(10), power: { kind: "zone", low: 5, high: 1 } }]),
    ).toBe("steps[0]: power.low (5) > power.high (1)");
    expect(
      issues([
        {
          type: "steady",
          duration: minutes(30),
          power: { kind: "percent_ftp", low: 90, high: 70 },
        },
      ]),
    ).toBe("steps[0]: power.low (90) > power.high (70)");
  });

  it("rejects percent_ftp above 200 and watts above 1500 as beyond the sanity bound", () => {
    expect(
      issues([
        {
          type: "interval",
          duration: { value: 30, unit: "seconds" },
          power: { kind: "percent_ftp", value: 250 },
        },
      ]),
    ).toBe("steps[0].power.value: 250% exceeds sanity bound 200%");
    expect(
      issues([
        {
          type: "interval",
          duration: { value: 5, unit: "seconds" },
          power: { kind: "watts", value: 2000 },
        },
      ]),
    ).toBe("steps[0].power.value: 2000w exceeds sanity bound 1500w");
  });

  it("rejects a power target with neither value nor low and high", () => {
    expect(
      issues([{ type: "steady", duration: minutes(30), power: { kind: "percent_ftp" } }]),
    ).toBe("steps[0]: power requires 'value' or 'low'+'high'");
  });

  it("uses the range when a target has both value and low and high", () => {
    expect(
      formatted([
        {
          type: "steady",
          duration: minutes(20),
          power: { kind: "percent_ftp", value: 70, low: 65, high: 75 },
        },
      ]).description,
    ).toBe("Main set\n- 20m 65-75%");
  });

  it("rejects inverted, half-open and empty cadence targets", () => {
    const power = { kind: "percent_ftp" as const, value: 65 };
    expect(
      issues([{ type: "steady", duration: minutes(30), power, cadence: { low: 100, high: 80 } }]),
    ).toBe("steps[0]: cadence.low (100) > cadence.high (80)");
    expect(issues([{ type: "steady", duration: minutes(30), power, cadence: { low: 80 } }])).toBe(
      "steps[0]: cadence range requires both 'low' and 'high'",
    );
    expect(issues([{ type: "steady", duration: minutes(30), power, cadence: {} }])).toBe(
      "steps[0]: cadence requires 'target' or 'low'+'high'",
    );
    expect(
      formatted([{ type: "steady", duration: minutes(30), power, cadence: { target: 90 } }])
        .description,
    ).toBe("Main set\n- 30m 65% 90rpm");
  });
});

describe("cyclingStepsField schema", () => {
  const step = { type: "steady", duration: minutes(1), power: { kind: "percent_ftp", value: 65 } };

  it.each([
    ["an empty steps array", []],
    ["more than 40 top-level steps", Array.from({ length: 41 }, () => step)],
    [
      "a set repeated more than 20 times",
      [{ type: "set", repeat: 21, interval: step, recovery: step }],
    ],
    ["a distance-based duration", [{ ...step, duration: { value: 10, unit: "distance_km" } }]],
    ["a label with a line break", [{ ...step, label: "Z2\n- 60m 300w" }]],
    ["an unknown step key", [{ ...step, notes: "spin easy" }]],
    ["a heart-rate target kind", [{ ...step, power: { kind: "heart_rate", value: 140 } }]],
  ])("rejects %s", (_label, steps) => {
    expect(cyclingStepsField.safeParse(steps).success).toBe(false);
  });

  it("accepts a valid set", () => {
    expect(
      cyclingStepsField.safeParse([{ type: "set", repeat: 3, interval: step, recovery: step }])
        .success,
    ).toBe(true);
  });
});
