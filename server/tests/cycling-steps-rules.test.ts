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
    ).toBe("Main set\n- 5m\n- 20m freeride");
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

  it("rejects an inverted range on a step that is not a ramp, for every power kind", () => {
    expect(
      issues([
        {
          type: "steady",
          duration: minutes(30),
          power: { kind: "percent_ftp", low: 90, high: 70 },
        },
      ]),
    ).toBe("steps[0]: power.low (90) > power.high (70)");
    expect(
      issues([
        { type: "warmup", duration: minutes(10), power: { kind: "watts", low: 200, high: 150 } },
      ]),
    ).toBe("steps[0]: power.low (200) > power.high (150)");
    expect(
      issues([
        { type: "interval", duration: minutes(5), power: { kind: "zone", low: 5, high: 4 } },
      ]),
    ).toBe("steps[0]: power.low (5) > power.high (4)");
  });

  it.each([
    {
      power: { kind: "percent_ftp", low: 60, high: 40 },
      reply:
        "steps[0]: power.low (60) > power.high (40). A cooldown range is one steady target, so for a ramp down from 60% FTP to 40% FTP use type 'ramp' with low 60 and high 40",
    },
    {
      power: { kind: "watts", low: 200, high: 150 },
      reply:
        "steps[0]: power.low (200) > power.high (150). A cooldown range is one steady target, so for a ramp down from 200w to 150w use type 'ramp' with low 200 and high 150",
    },
    {
      power: { kind: "zone", low: 3, high: 2 },
      reply:
        "steps[0]: power.low (3) > power.high (2). A cooldown range is one steady target, so for a ramp down from Z3 to Z2 use type 'ramp' with low 3 and high 2. A zone ramp is written as each zone's midpoint percent of FTP, so this one reads back as ramp 83-65%",
    },
  ] as const)(
    "points a $power.kind cooldown with low above high at a ramp, in its unit",
    ({ power, reply }) => {
      expect(issues([{ type: "cooldown", duration: minutes(10), power }])).toBe(reply);
    },
  );

  it("names the read-back that the suggested zone ramp writes", () => {
    const power = { kind: "zone", low: 3, high: 2 } as const;
    const hint = issues([{ type: "cooldown", duration: minutes(10), power }]);
    const readBack = /reads back as (.+)$/.exec(hint)?.[1];
    expect(readBack).toBeDefined();
    expect(formatted([{ type: "ramp", duration: minutes(10), power }]).description).toBe(
      `Main set\n- 10m ${readBack}`,
    );
  });

  it("gives a cooldown with an out-of-range zone the plain inverted-range error", () => {
    expect(
      issues([
        { type: "cooldown", duration: minutes(10), power: { kind: "zone", low: 9, high: 2 } },
      ]),
    ).toBe(
      "steps[0].power.low: zone must be an integer 1-7, got 9; steps[0]: power.low (9) > power.high (2)",
    );
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

const steady = (label: string) => ({
  type: "steady" as const,
  duration: minutes(2),
  power: { kind: "percent_ftp" as const, value: 80 },
  label,
});

describe("step labels", () => {
  it.each([
    "hold 95% then sprint",
    "Z4 effort",
    "90rpm",
    "5m easy",
    "HR check",
    "hr check",
    "3x",
    "push to LTHR",
    "ramp up",
    "Freeride",
    "steady pace",
    "MMP effort",
    "high rpm",
    "big w",
    "hold watts",
    "last km",
    "press lap",
    "wait <!> here",
  ])("rejects %j, which intervals.icu would read as workout text", (label) => {
    expect(issues([steady(label)])).toMatch(/^steps\[0\]\.label: /);
  });

  it.each([
    ["hidepower now", "hidepower"],
    ["show it /HidePower", "HidePower"],
    ["MaxEffort sprint", "MaxEffort"],
    ["easy intensity=recovery", "intensity="],
    ["easy power=lap", "power="],
    ["Power=lap spin", "Power="],
    ["sprint ٣ times", "٣"],
    ["hold ３ breaths", "３"],
  ])("rejects %j, naming %j as the workout text intervals.icu reads", (label, token) => {
    expect(issues([steady(label)])).toBe(
      `steps[0].label: ${JSON.stringify(label)} contains ${JSON.stringify(token)}, which intervals.icu reads as workout text. Use short words without numbers or target keywords`,
    );
  });

  it.each([
    ["en/Hello", "en/"],
    ["spin fr/Bonjour", "fr/"],
    ["XX/cue", "XX/"],
    ["on/off", "on/"],
    ["pt-BR/Ola", "BR/"],
  ])("rejects %j, naming %j as a language prefix", (label, prefix) => {
    expect(issues([steady(label)])).toBe(
      `steps[0].label: ${JSON.stringify(label)} contains ${JSON.stringify(prefix)}, which intervals.icu reads as a language prefix (two letters followed by /). Write the words out instead, such as "on and off"`,
    );
  });

  it.each(["   ", " ", "​", "\u3164", "\u115f\u1160", "\uffa0", " \u2800\u200b "])(
    "rejects the blank label %j",
    (label) => {
      expect(issues([steady(label)])).toBe(
        `steps[0].label: ${JSON.stringify(label)} is blank. Leave the label out or write a short cue`,
      );
    },
  );

  it("writes an empty label as a step with no cue", () => {
    expect(formatted([steady("")]).description).toBe("Main set\n- 2m 80%");
  });

  it("names the label's path inside a set, alongside the step's other issues", () => {
    const details = issues([
      steady("seated"),
      {
        type: "set",
        repeat: 3,
        interval: { type: "interval", duration: minutes(3), label: "Z5" },
        recovery: { ...steady("easy"), label: "spin 2 min" },
      },
    ]);
    expect(details.split("; ").map((issue) => issue.split(":")[0])).toEqual([
      "steps[1].interval",
      "steps[1].interval.label",
      "steps[1].recovery.label",
    ]);
  });

  it.each([
    "Sweet spot",
    "Over unders",
    "high cadence",
    "all-out",
    "Shred the climb",
    "Stay seated",
    "low intensity",
    "max effort",
    "hide the pain",
    "and/or",
    "power through",
    "\u3164seated",
  ])(
    "writes the plain label %j before the duration, where intervals.icu reads the cue",
    (label) => {
      expect(formatted([steady(label)]).description).toBe(`Main set\n- ${label} 2m 80%`);
    },
  );
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
