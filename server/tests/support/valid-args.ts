import type { Sport } from "../../src/workout-kinds.js";

export const VALID_CREATE_ARGS: Readonly<Record<Sport, (date: string) => Record<string, unknown>>> =
  {
    cycling: (date) => ({
      date,
      name: "Sweet Spot 3x15",
      steps: [
        {
          type: "warmup",
          duration: { value: 10, unit: "minutes" },
          power: { kind: "percent_ftp", low: 50, high: 70 },
        },
        {
          type: "set",
          repeat: 3,
          interval: {
            type: "interval",
            duration: { value: 15, unit: "minutes" },
            power: { kind: "percent_ftp", low: 88, high: 94 },
          },
          recovery: {
            type: "recovery",
            duration: { value: 5, unit: "minutes" },
            power: { kind: "percent_ftp", value: 50 },
          },
        },
        {
          type: "cooldown",
          duration: { value: 10, unit: "minutes" },
          power: { kind: "percent_ftp", value: 45 },
        },
      ],
    }),
    strength: (date) => ({
      date,
      name: "Lower body 45min",
      description: "Back squat 4x6 @ effort 7, rest 2 min\nRomanian deadlift 3x8 @ effort 6",
      durationMinutes: 45,
    }),
  };

export const PINNED_NOW = new Date("2026-10-20T03:00:00Z");
