import { describe, expect, it } from "vitest";
import { formatted } from "./support/cycling.js";

describe("formatCyclingSteps description", () => {
  it("writes a Z2 endurance ride as percent-of-FTP ranges with cadence under section headers", () => {
    const { description } = formatted([
      {
        type: "warmup",
        duration: { value: 10, unit: "minutes" },
        power: { kind: "percent_ftp", low: 50, high: 65 },
        cadence: { low: 85, high: 95 },
      },
      {
        type: "steady",
        duration: { value: 70, unit: "minutes" },
        power: { kind: "percent_ftp", low: 56, high: 75 },
        cadence: { low: 85, high: 95 },
      },
      {
        type: "cooldown",
        duration: { value: 10, unit: "minutes" },
        power: { kind: "percent_ftp", value: 50 },
        cadence: { low: 85, high: 95 },
      },
    ]);
    expect(description).toBe(
      "Warmup\n- 10m 50-65% 85-95rpm\n\nMain set\n- 70m 56-75% 85-95rpm\n\nCooldown\n- 10m 50% 85-95rpm",
    );
  });

  it("writes a sweet-spot set as a Main set Nx block with labelled interval and recovery lines", () => {
    const { description } = formatted([
      {
        type: "warmup",
        duration: { value: 15, unit: "minutes" },
        power: { kind: "percent_ftp", low: 50, high: 65 },
      },
      {
        type: "set",
        repeat: 3,
        interval: {
          type: "interval",
          duration: { value: 15, unit: "minutes" },
          power: { kind: "percent_ftp", low: 88, high: 94 },
          cadence: { low: 85, high: 95 },
          label: "Sweet spot",
        },
        recovery: {
          type: "recovery",
          duration: { value: 4, unit: "minutes" },
          power: { kind: "percent_ftp", value: 50 },
        },
      },
      {
        type: "cooldown",
        duration: { value: 10, unit: "minutes" },
        power: { kind: "percent_ftp", value: 50 },
      },
    ]);
    expect(description).toBe(
      "Warmup\n- 15m 50-65%\n\nMain set 3x\n- 15m 88-94% 85-95rpm Sweet spot\n- 4m 50%\n\nCooldown\n- 10m 50%",
    );
  });

  it("isolates a set from the main-set step that follows it with a blank line", () => {
    expect(
      formatted([
        {
          type: "warmup",
          duration: { value: 5, unit: "minutes" },
          power: { kind: "percent_ftp", low: 45, high: 65 },
        },
        {
          type: "set",
          repeat: 2,
          interval: {
            type: "interval",
            duration: { value: 2, unit: "minutes" },
            power: { kind: "percent_ftp", value: 75 },
          },
          recovery: {
            type: "recovery",
            duration: { value: 1, unit: "minutes" },
            power: { kind: "percent_ftp", value: 50 },
          },
        },
        {
          type: "steady",
          duration: { value: 4, unit: "minutes" },
          power: { kind: "percent_ftp", value: 45 },
        },
      ]),
    ).toEqual({
      description: "Warmup\n- 5m 45-65%\n\nMain set 2x\n- 2m 75%\n- 1m 50%\n\n- 4m 45%",
      movingTimeSeconds: 15 * 60,
    });
  });

  it("prints a bare Nx header for a set that does not open its section, and separates consecutive sets", () => {
    const { description } = formatted([
      {
        type: "steady",
        duration: { value: 5, unit: "minutes" },
        power: { kind: "percent_ftp", value: 65 },
      },
      {
        type: "set",
        repeat: 2,
        interval: {
          type: "interval",
          duration: { value: 2, unit: "minutes" },
          power: { kind: "percent_ftp", value: 75 },
        },
        recovery: {
          type: "recovery",
          duration: { value: 1, unit: "minutes" },
          power: { kind: "percent_ftp", value: 50 },
        },
      },
      {
        type: "set",
        repeat: 3,
        interval: {
          type: "interval",
          duration: { value: 1, unit: "minutes" },
          power: { kind: "percent_ftp", value: 80 },
        },
        recovery: {
          type: "recovery",
          duration: { value: 1, unit: "minutes" },
          power: { kind: "percent_ftp", value: 50 },
        },
      },
    ]);
    expect(description).toBe(
      "Main set\n- 5m 65%\n\n2x\n- 2m 75%\n- 1m 50%\n\n3x\n- 1m 80%\n- 1m 50%",
    );
  });

  it("writes a ramp with the ramp keyword and both bounds", () => {
    const { description } = formatted([
      {
        type: "ramp",
        duration: { value: 10, unit: "minutes" },
        power: { kind: "percent_ftp", low: 50, high: 80 },
      },
    ]);
    expect(description).toBe("Main set\n- 10m ramp 50-80%");
  });

  it("keeps zone targets as Z shorthand so intervals.icu applies the athlete's own bands", () => {
    expect(
      formatted([
        {
          type: "steady",
          duration: { value: 60, unit: "minutes" },
          power: { kind: "zone", value: 2 },
        },
      ]).description,
    ).toContain("- 60m Z2");
    expect(
      formatted([
        {
          type: "steady",
          duration: { value: 30, unit: "minutes" },
          power: { kind: "zone", low: 2, high: 3 },
        },
      ]).description,
    ).toContain("- 30m Z2-Z3");
  });

  it("writes watts targets as absolute values", () => {
    const { description } = formatted([
      {
        type: "steady",
        duration: { value: 30, unit: "minutes" },
        power: { kind: "watts", low: 150, high: 180 },
      },
    ]);
    expect(description).toContain("- 30m 150-180w");
  });

  it("formats sub-minute durations as seconds and 90 seconds as 1m30", () => {
    const { description } = formatted([
      {
        type: "interval",
        duration: { value: 30, unit: "seconds" },
        power: { kind: "percent_ftp", value: 150 },
      },
      {
        type: "interval",
        duration: { value: 90, unit: "seconds" },
        power: { kind: "percent_ftp", value: 120 },
      },
    ]);
    expect(description).toBe("Main set\n- 30s 150%\n- 1m30 120%");
  });

  it("writes the freeride keyword after the duration so the step runs with ERG off", () => {
    const { description } = formatted([
      { type: "freeride", duration: { value: 60, unit: "minutes" }, label: "Keep it easy" },
    ]);
    expect(description).toBe("Main set\n- 60m freeride Keep it easy");
  });

  it("keeps a freeride power target and cadence after the freeride keyword", () => {
    const { description } = formatted([
      {
        type: "freeride",
        duration: { value: 20, unit: "minutes" },
        power: { kind: "zone", value: 2 },
        cadence: { target: 90 },
      },
    ]);
    expect(description).toBe("Main set\n- 20m freeride Z2 90rpm");
  });

  it("does not repeat the section header for consecutive steps of the same section", () => {
    const { description } = formatted([
      {
        type: "warmup",
        duration: { value: 5, unit: "minutes" },
        power: { kind: "percent_ftp", value: 50 },
      },
      {
        type: "warmup",
        duration: { value: 5, unit: "minutes" },
        power: { kind: "percent_ftp", value: 60 },
      },
    ]);
    expect(description).toBe("Warmup\n- 5m 50%\n- 5m 60%");
  });
});

describe("formatCyclingSteps moving time", () => {
  it("sums simple step durations", () => {
    expect(
      formatted([
        {
          type: "warmup",
          duration: { value: 10, unit: "minutes" },
          power: { kind: "percent_ftp", value: 55 },
        },
        {
          type: "steady",
          duration: { value: 30, unit: "minutes" },
          power: { kind: "percent_ftp", value: 65 },
        },
        {
          type: "cooldown",
          duration: { value: 5, unit: "minutes" },
          power: { kind: "percent_ftp", value: 50 },
        },
      ]).movingTimeSeconds,
    ).toBe(45 * 60);
  });

  it("counts a 3x(15+4) set between 10-minute ends as 77 minutes", () => {
    expect(
      formatted([
        {
          type: "warmup",
          duration: { value: 10, unit: "minutes" },
          power: { kind: "percent_ftp", value: 55 },
        },
        {
          type: "set",
          repeat: 3,
          interval: {
            type: "interval",
            duration: { value: 15, unit: "minutes" },
            power: { kind: "percent_ftp", value: 90 },
          },
          recovery: {
            type: "recovery",
            duration: { value: 4, unit: "minutes" },
            power: { kind: "percent_ftp", value: 50 },
          },
        },
        {
          type: "cooldown",
          duration: { value: 10, unit: "minutes" },
          power: { kind: "percent_ftp", value: 50 },
        },
      ]).movingTimeSeconds,
    ).toBe(77 * 60);
  });

  it("mixes seconds and minutes", () => {
    expect(
      formatted([
        {
          type: "steady",
          duration: { value: 90, unit: "seconds" },
          power: { kind: "percent_ftp", value: 70 },
        },
        {
          type: "steady",
          duration: { value: 2, unit: "minutes" },
          power: { kind: "percent_ftp", value: 70 },
        },
      ]).movingTimeSeconds,
    ).toBe(210);
  });
});

describe("formatCyclingSteps zone ramps", () => {
  it("turns a Z1-Z2 ramp into percent-of-FTP band centres", () => {
    expect(
      formatted([
        {
          type: "ramp",
          duration: { value: 10, unit: "minutes" },
          power: { kind: "zone", low: 1, high: 2 },
        },
      ]),
    ).toEqual({ description: "Main set\n- 10m ramp 45-65%", movingTimeSeconds: 600 });
  });

  it("rounds the Z6 half-percent band centre up to 136", () => {
    expect(
      formatted([
        {
          type: "ramp",
          duration: { value: 1, unit: "minutes" },
          power: { kind: "zone", low: 6, high: 7 },
        },
      ]).description,
    ).toContain("ramp 136-160%");
  });

  it("writes equal bounds for an equal-zone ramp", () => {
    expect(
      formatted([
        {
          type: "ramp",
          duration: { value: 5, unit: "minutes" },
          power: { kind: "zone", low: 2, high: 2 },
        },
      ]).description,
    ).toContain("ramp 65-65%");
  });
});
