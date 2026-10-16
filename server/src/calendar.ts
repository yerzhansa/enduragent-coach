import { IntervalsClient, type ApiError, type Result } from "intervals-icu-api";
import { z } from "zod";
import { refusal, type Refusal, type RefusalOf } from "./tool-contract.js";

declare const apiKeyBrand: unique symbol;
declare const calendarDayBrand: unique symbol;
declare const timeZoneBrand: unique symbol;
declare const eventIdBrand: unique symbol;

export type ApiKey = string & { readonly [apiKeyBrand]: true };
export type CalendarDay = string & { readonly [calendarDayBrand]: true };
export type TimeZone = string & { readonly [timeZoneBrand]: true };
export type EventId = number & { readonly [eventIdBrand]: true };

export type { ApiError, Result };

export const PROVENANCE_TAG = "enduragent-coach";

export interface DayQuery {
  readonly oldest: CalendarDay;
  readonly newest: CalendarDay;
  readonly category: ["WORKOUT"];
}

export type WorkoutEventType = "Ride" | "WeightTraining";

export interface NewWorkoutEvent {
  readonly startDateLocal: `${CalendarDay}T00:00:00`;
  readonly category: "WORKOUT";
  readonly type: WorkoutEventType;
  readonly name: string;
  readonly description: string;
  readonly movingTime: number;
  readonly tags: string[];
  readonly externalId: string;
}

export interface IntervalsPort {
  readonly athlete: { get(): Promise<Result<unknown>> };
  readonly events: {
    list(query: DayQuery): Promise<Result<readonly unknown[]>>;
    get(eventId: number): Promise<Result<unknown>>;
    create(body: NewWorkoutEvent): Promise<Result<unknown>>;
  };
}

export type IntervalsCredentials = { readonly apiKey: ApiKey } | { readonly bearerToken: string };

export const REQUEST_TIMEOUT_MS = 10_000;

export const READ_RETRY = { maxAttempts: 2, maxDelayMs: 2_000 } as const;

export function connectIntervals(credentials: IntervalsCredentials): IntervalsPort {
  return new IntervalsClient({
    ...credentials,
    athleteId: "0",
    timeoutMs: REQUEST_TIMEOUT_MS,
    retry: READ_RETRY,
  });
}

function isApiKey(value: string): value is ApiKey {
  return value !== "" && !(value.startsWith("${") && value.endsWith("}"));
}

export function readApiKey(raw: string | undefined): ApiKey | undefined {
  const trimmed = raw?.trim() ?? "";
  return isApiKey(trimmed) ? trimmed : undefined;
}

export async function attempt<T>(call: () => Promise<Result<T>>): Promise<Result<T>> {
  try {
    return await call();
  } catch (error) {
    return { ok: false, error: { kind: "Unknown", error } };
  }
}

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isCalendarDay(raw: string): raw is CalendarDay {
  if (!DAY_PATTERN.test(raw)) return false;
  const ms = Date.parse(`${raw}T00:00:00Z`);
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === raw;
}

export function parseCalendarDay(raw: string): CalendarDay | undefined {
  return isCalendarDay(raw) ? raw : undefined;
}

export function dayQuery(day: CalendarDay): DayQuery {
  return { oldest: day, newest: day, category: ["WORKOUT"] };
}

function isTimeZone(name: string): name is TimeZone {
  if (name === "") return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: name }).format(0);
    return true;
  } catch {
    return false;
  }
}

export function parseTimeZone(raw: unknown): TimeZone | undefined {
  if (typeof raw !== "string") return undefined;
  const name = raw.trim();
  return isTimeZone(name) ? name : undefined;
}

const athleteSchema = z.object({ timezone: z.unknown().optional() });

export function athleteTimeZone(athlete: unknown): TimeZone | undefined {
  const parsed = athleteSchema.safeParse(athlete);
  return parsed.success ? parseTimeZone(parsed.data.timezone) : undefined;
}

export function todayIn(zone: TimeZone, now: Date): CalendarDay | undefined {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((candidate) => candidate.type === type)?.value ?? "";
  return parseCalendarDay(`${part("year")}-${part("month")}-${part("day")}`);
}

function isEventId(id: number): id is EventId {
  return Number.isSafeInteger(id) && id > 0;
}

const createdEventSchema = z.object({ id: z.number() });

export function parseEventId(raw: unknown): EventId | undefined {
  const parsed = createdEventSchema.safeParse(raw);
  if (!parsed.success) return undefined;
  const id = parsed.data.id;
  return isEventId(id) ? id : undefined;
}

const storedEventSchema = z.object({
  id: z.number().int().positive(),
  startDateLocal: z.string(),
  category: z.string(),
  type: z.string().nullish(),
  name: z.string().nullish(),
  description: z.string().nullish(),
  movingTime: z.number().nullish(),
  icuTrainingLoad: z.number().nullish(),
  workoutDoc: z.unknown().optional(),
  tags: z.array(z.string()).nullish(),
  externalId: z.string().nullish(),
});

const workoutDocSchema = z.object({ steps: z.array(z.unknown()).min(1) });

export interface StoredWorkout {
  readonly eventId: EventId;
  readonly date: string;
  readonly category: string;
  readonly type: string | null;
  readonly name: string | null;
  readonly description: string | null;
  readonly movingTimeSeconds: number | null;
  readonly load: number | null;
  readonly hasStructuredSteps: boolean;
  readonly chartWillRender: boolean | null;
  readonly externalId: string | null;
  readonly isPluginWorkout: boolean;
}

export function parseStoredWorkout(raw: unknown): StoredWorkout | undefined {
  const parsed = storedEventSchema.safeParse(raw);
  if (!parsed.success) return undefined;
  const event = parsed.data;
  const eventId = event.id;
  if (!isEventId(eventId)) return undefined;
  const type = event.type ?? null;
  const externalId = event.externalId ?? null;
  const hasStructuredSteps = workoutDocSchema.safeParse(event.workoutDoc).success;
  return {
    eventId,
    date: event.startDateLocal.slice(0, 10),
    category: event.category,
    type,
    name: event.name ?? null,
    description: event.description?.replace(/\r\n/g, "\n") ?? null,
    movingTimeSeconds: event.movingTime ?? null,
    load: event.icuTrainingLoad ?? null,
    hasStructuredSteps,
    chartWillRender: type === "Ride" ? hasStructuredSteps : null,
    externalId,
    isPluginWorkout:
      (event.tags ?? []).includes(PROVENANCE_TAG) ||
      (externalId?.startsWith(`${PROVENANCE_TAG}:`) ?? false),
  };
}

export function parseStoredWorkouts(raw: readonly unknown[]): readonly StoredWorkout[] | undefined {
  const workouts: StoredWorkout[] = [];
  for (const entry of raw) {
    const workout = parseStoredWorkout(entry);
    if (workout === undefined) return undefined;
    workouts.push(workout);
  }
  return workouts;
}

const UNAUTHORIZED_DETAILS = "intervals.icu answered 401 Unauthorized.";
const FORBIDDEN_DETAILS = "intervals.icu answered 403 Forbidden.";
const RATE_LIMITED_DETAILS = "intervals.icu answered 429 Too Many Requests.";

export type ReadFailure = RefusalOf<
  "unauthorized" | "forbidden" | "rate_limited" | "not_found" | "intervals_unavailable"
>;

export function readFailure(error: ApiError): ReadFailure {
  switch (error.kind) {
    case "Unauthorized":
      return refusal("unauthorized", UNAUTHORIZED_DETAILS);
    case "Forbidden":
      return refusal("forbidden", FORBIDDEN_DETAILS);
    case "RateLimit":
      return refusal("rate_limited", RATE_LIMITED_DETAILS, retryAfterSeconds(error.retryAfterMs));
    case "NotFound":
      return refusal("not_found", "intervals.icu answered 404 Not Found.");
    case "Http":
    case "Validation":
    case "Timeout":
    case "Network":
    case "Unknown":
      return refusal("intervals_unavailable", describeUnavailable(error));
    default: {
      const unreachable: never = error;
      return unreachable;
    }
  }
}

export type DayReadFailure = Exclude<ReadFailure, Refusal<"not_found">>;

export function dayReadFailure(error: ApiError): DayReadFailure {
  const failure = readFailure(error);
  return failure.code === "not_found"
    ? refusal(
        "intervals_unavailable",
        "intervals.icu answered 404 Not Found for the athlete or the calendar day.",
      )
    : failure;
}

export type WriteFailure =
  | {
      readonly written: "no";
      readonly refusal: RefusalOf<"unauthorized" | "forbidden" | "rate_limited" | "rejected">;
    }
  | { readonly written: "maybe"; readonly details: string };

export function writeFailure(error: ApiError): WriteFailure {
  switch (error.kind) {
    case "Unauthorized":
      return { written: "no", refusal: refusal("unauthorized", UNAUTHORIZED_DETAILS) };
    case "Forbidden":
      return { written: "no", refusal: refusal("forbidden", FORBIDDEN_DETAILS) };
    case "RateLimit":
      return {
        written: "no",
        refusal: refusal(
          "rate_limited",
          RATE_LIMITED_DETAILS,
          retryAfterSeconds(error.retryAfterMs),
        ),
      };
    case "NotFound":
      return {
        written: "no",
        refusal: refusal("rejected", "intervals.icu answered 404 Not Found."),
      };
    case "Http":
      return error.status === 400
        ? {
            written: "no",
            refusal: refusal(
              "rejected",
              withBodyMessage("intervals.icu answered 400 Bad Request.", error.body),
            ),
          }
        : { written: "maybe", details: describeUnavailable(error) };
    case "Validation":
    case "Timeout":
    case "Network":
    case "Unknown":
      return { written: "maybe", details: describeUnavailable(error) };
    default: {
      const unreachable: never = error;
      return unreachable;
    }
  }
}

type UnavailableError = Extract<
  ApiError,
  { kind: "Http" | "Validation" | "Timeout" | "Network" | "Unknown" }
>;

function describeUnavailable(error: UnavailableError): string {
  switch (error.kind) {
    case "Http":
      return error.statusText === ""
        ? `intervals.icu answered ${error.status}.`
        : `intervals.icu answered ${error.status} ${error.statusText}.`;
    case "Validation":
      return "intervals.icu answered with a response this plugin could not read.";
    case "Timeout":
      return "The request to intervals.icu timed out.";
    case "Network":
      return "intervals.icu could not be reached.";
    case "Unknown":
      return "The request to intervals.icu failed unexpectedly.";
    default: {
      const unreachable: never = error;
      return unreachable;
    }
  }
}

const bodyMessageSchema = z.union([
  z.object({ message: z.string().min(1) }).transform((body) => body.message),
  z.object({ error: z.string().min(1) }).transform((body) => body.error),
]);

const MAX_BODY_MESSAGE_LENGTH = 300;

function withBodyMessage(summary: string, body: unknown): string {
  const parsed = bodyMessageSchema.safeParse(body);
  return parsed.success ? `${summary} ${parsed.data.slice(0, MAX_BODY_MESSAGE_LENGTH)}` : summary;
}

function retryAfterSeconds(retryAfterMs: number): number {
  return Math.max(1, Math.ceil(retryAfterMs / 1000));
}
