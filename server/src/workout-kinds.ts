import { z } from "zod";
import { createArgsSchema, defineWorkoutKind } from "./create-workout.js";
import { cyclingStepsField, formatCyclingSteps } from "./cycling-steps.js";

export const WORKOUT_KINDS = [
  defineWorkoutKind({
    sport: "cycling",
    title: "Create cycling workout",
    description:
      "Create a structured cycling workout on the athlete's intervals.icu calendar. Supply structured steps; " +
      "the tool writes them in intervals.icu's workout text so the power chart renders. Power targets only. " +
      "Put coaching narrative in your chat reply, not here. Dates before today in the athlete's time zone " +
      "are refused. A workout with the same name on that day is not saved unless the athlete confirms. " +
      "After a created reply, call get_workout.",
    eventType: "Ride",
    input: createArgsSchema({ steps: cyclingStepsField }),
    toEventFields: (args) => formatCyclingSteps(args.steps),
  }),
  defineWorkoutKind({
    sport: "strength",
    title: "Create strength workout",
    description:
      "Create a strength or gym session on the athlete's intervals.icu calendar. The free-text description " +
      "carries the whole session: exercises, sets x reps, weight or effort 1-10, rest. Dates before today in " +
      "the athlete's time zone are refused. A workout with the same name on that day is not saved unless the " +
      "athlete confirms. After a created reply, call get_workout.",
    eventType: "WeightTraining",
    input: createArgsSchema({
      description: z
        .string()
        .min(1)
        .max(4000)
        .describe("Session content: exercises, sets x reps, weight or effort, rest"),
      durationMinutes: z
        .number()
        .int()
        .min(1)
        .max(600)
        .describe("Planned session length in whole minutes"),
    }),
    toEventFields: (args) => ({
      ok: true,
      value: { description: args.description, movingTimeSeconds: args.durationMinutes * 60 },
    }),
  }),
] as const;

export type Sport = (typeof WORKOUT_KINDS)[number]["sport"];

export const SPORTS: readonly Sport[] = WORKOUT_KINDS.map((kind) => kind.sport);
