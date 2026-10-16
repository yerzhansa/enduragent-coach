import { z } from "zod";
import { attempt, parseStoredWorkout, readFailure } from "./calendar.js";
import {
  refusal,
  renderReadReply,
  type CoachDeps,
  type CoachTool,
  type ReadReply,
} from "./tool-contract.js";

const getWorkoutInput = z
  .object({
    eventId: z
      .number()
      .int()
      .positive()
      .describe("eventId from a created or duplicate_found reply"),
  })
  .strict();

export const GET_WORKOUT: CoachTool<"get_workout"> = {
  name: "get_workout",
  title: "Read back a workout",
  description:
    "Read a workout from the athlete's intervals.icu calendar by eventId: date, category, type, name, the stored " +
    "description, moving time, load, whether intervals.icu parsed it into structured steps, and for cycling " +
    "whether the power chart will render.",
  inputSchema: getWorkoutInput,
  readOnly: true,
  run: async (args, deps) => renderReadReply(await readWorkout(args, deps)),
};

async function readWorkout(raw: unknown, deps: CoachDeps): Promise<ReadReply> {
  const parsed = getWorkoutInput.safeParse(raw);
  if (!parsed.success) return refusal("invalid_input", z.prettifyError(parsed.error));
  const intervals = deps.intervals;
  if (intervals === undefined) {
    return refusal("not_configured", "INTERVALS_API_KEY is missing or empty.");
  }
  const fetched = await attempt(() => intervals.events.get(parsed.data.eventId));
  if (!fetched.ok) return readFailure(fetched.error);
  const workout = parseStoredWorkout(fetched.value);
  return workout === undefined
    ? refusal("intervals_unavailable", "The stored workout came back in an unexpected shape.")
    : { status: "found", workout };
}
