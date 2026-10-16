import { z } from "zod";
import {
  PROVENANCE_TAG,
  athleteTimeZone,
  attempt,
  dayQuery,
  dayReadFailure,
  parseCalendarDay,
  parseDayListing,
  parseEventId,
  todayIn,
  writeFailure,
  type CalendarDay,
  type IntervalsPort,
  type NewWorkoutEvent,
  type WorkoutEventType,
} from "./calendar.js";
import { keyedLock } from "./keyed-lock.js";
import {
  refusal,
  renderCreateReply,
  type CoachDeps,
  type CoachTool,
  type CreateReply,
} from "./tool-contract.js";

export type Checked<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly details: string };

export interface EventBody {
  readonly description: string;
  readonly movingTimeSeconds: number;
}

export const NO_CONTROL_CHARACTERS = /^[^\p{Cc}\p{Zl}\p{Zp}]*$/u;

export const workoutNameField = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(NO_CONTROL_CHARACTERS, "no line breaks or control characters")
  .describe("Calendar card title, one line");

const commonCreateFields = {
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .describe("The athlete's local calendar day, YYYY-MM-DD, today or later"),
  name: workoutNameField,
  confirmDuplicate: z
    .boolean()
    .default(false)
    .describe(
      "Set true only after the athlete said yes to adding a second workout with the same name that day",
    ),
};

export interface CreateArgs {
  readonly date: string;
  readonly name: string;
  readonly confirmDuplicate: boolean;
}

export function createArgsSchema<F extends z.ZodRawShape>(fields: F) {
  return z.object(commonCreateFields).extend(fields).strict();
}

export interface WorkoutKindSpec<S extends string, A extends CreateArgs> {
  readonly sport: S;
  readonly title: string;
  readonly description: string;
  readonly eventType: WorkoutEventType;
  readonly input: z.ZodType<A>;
  readonly toEventFields: (args: A) => Checked<EventBody>;
}

export type CreateToolName<S extends string> = `create_${S}_workout`;

export interface WorkoutKind<S extends string> extends CoachTool<CreateToolName<S>> {
  readonly sport: S;
}

export function defineWorkoutKind<const S extends string, A extends CreateArgs>(
  spec: WorkoutKindSpec<S, A>,
): WorkoutKind<S> {
  const name: CreateToolName<S> = `create_${spec.sport}_workout`;
  return {
    sport: spec.sport,
    name,
    title: spec.title,
    description: spec.description,
    inputSchema: spec.input,
    readOnly: false,
    run: async (args, deps) => renderCreateReply(await runCreate(spec, name, args, deps)),
  };
}

async function runCreate<S extends string, A extends CreateArgs>(
  spec: WorkoutKindSpec<S, A>,
  tool: CreateToolName<S>,
  raw: unknown,
  deps: CoachDeps,
): Promise<CreateReply> {
  const parsed = spec.input.safeParse(raw);
  if (!parsed.success) return refusal("invalid_input", z.prettifyError(parsed.error));
  const args = parsed.data;
  const intervals = deps.intervals;
  if (intervals === undefined) {
    return refusal("not_configured", "INTERVALS_API_KEY is missing or empty.");
  }
  const day = parseCalendarDay(args.date);
  if (day === undefined) {
    return refusal("invalid_date", `${args.date} is not a real calendar date.`);
  }
  const fields = spec.toEventFields(args);
  if (!fields.ok) return refusal("invalid_workout", fields.details);

  return sameDayCreates(day, async () =>
    saveOnDay(intervals, deps.now, {
      tool,
      sport: spec.sport,
      eventType: spec.eventType,
      day,
      name: args.name,
      confirmDuplicate: args.confirmDuplicate,
      body: fields.value,
    }),
  );
}

const sameDayCreates = keyedLock<CalendarDay>();

interface PlannedCreate {
  readonly tool: string;
  readonly sport: string;
  readonly eventType: WorkoutEventType;
  readonly day: CalendarDay;
  readonly name: string;
  readonly confirmDuplicate: boolean;
  readonly body: EventBody;
}

async function saveOnDay(
  intervals: IntervalsPort,
  now: () => Date,
  planned: PlannedCreate,
): Promise<CreateReply> {
  const { tool, day, name } = planned;
  const [athlete, listed] = await Promise.all([
    attempt(() => intervals.athlete.get()),
    attempt(() => intervals.events.list(dayQuery(day))),
  ]);
  if (!athlete.ok) return dayReadFailure(athlete.error);
  const zone = athleteTimeZone(athlete.value);
  const today = zone === undefined ? undefined : todayIn(zone, now());
  if (zone === undefined || today === undefined) {
    return refusal("timezone_missing", "Athlete.timezone is empty or not an IANA time zone name.");
  }
  if (day < today) {
    return refusal("past_date_refused", `${day} is before today (${today} in ${zone}).`);
  }
  if (!listed.ok) return dayReadFailure(listed.error);
  const { workouts, takenExternalIds } = parseDayListing(listed.value);

  const [first, ...others] = workouts.filter((workout) => isSameWorkoutName(name, workout.name));
  if (first !== undefined && !planned.confirmDuplicate) {
    return { status: "duplicate_found", tool, date: day, name, existing: [first, ...others] };
  }

  const externalId = allocateExternalId(baseExternalId(planned.sport, day, name), takenExternalIds);
  const event = toNewWorkoutEvent(planned.eventType, day, name, planned.body, externalId);
  const written = await attempt(() => intervals.events.create(event));
  const created = { tool, date: day, name, externalId };
  const uncertain = (details: string): CreateReply => ({
    status: "uncertain",
    ...created,
    confirmDuplicate: planned.confirmDuplicate,
    details,
  });
  if (written.ok) {
    const eventId = parseEventId(written.value);
    if (eventId !== undefined) return { status: "created", ...created, eventId, recovered: false };
    return recover(
      intervals,
      created,
      uncertain("intervals.icu saved the workout but returned no event id."),
    );
  }
  const failure = writeFailure(written.error);
  return failure.written === "no"
    ? failure.refusal
    : recover(intervals, created, uncertain(failure.details));
}

interface Attempted {
  readonly tool: string;
  readonly date: CalendarDay;
  readonly name: string;
  readonly externalId: string;
}

async function recover(
  intervals: IntervalsPort,
  attempted: Attempted,
  uncertain: CreateReply,
): Promise<CreateReply> {
  const listed = await attempt(() => intervals.events.list(dayQuery(attempted.date)));
  if (!listed.ok) return uncertain;
  const matches = parseDayListing(listed.value).workouts.filter(
    (workout) => workout.externalId === attempted.externalId,
  );
  const [match, ...extra] = matches;
  return match !== undefined && extra.length === 0
    ? { status: "created", ...attempted, eventId: match.eventId, recovered: true }
    : uncertain;
}

function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

function isSameWorkoutName(a: string, b: string | null): boolean {
  return b !== null && normalizeName(a) === normalizeName(b);
}

const MAX_SLUG_LENGTH = 40;

function slugify(text: string): string {
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/g, "");
  return slug.length > 0 ? slug : "workout";
}

function baseExternalId(sport: string, day: CalendarDay, name: string): string {
  return `${PROVENANCE_TAG}:${day}:${sport}-${slugify(name)}`;
}

function allocateExternalId(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base;
  let suffix = 2;
  while (taken.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}

function toNewWorkoutEvent(
  eventType: WorkoutEventType,
  day: CalendarDay,
  name: string,
  body: EventBody,
  externalId: string,
): NewWorkoutEvent {
  return {
    startDateLocal: `${day}T00:00:00`,
    category: "WORKOUT",
    type: eventType,
    name,
    description: body.description,
    movingTime: Math.round(body.movingTimeSeconds),
    tags: [PROVENANCE_TAG],
    externalId,
  };
}
