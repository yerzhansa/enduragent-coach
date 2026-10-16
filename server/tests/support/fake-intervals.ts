import type { ApiError, IntervalsPort, NewWorkoutEvent, Result } from "../../src/calendar.js";

export interface FakeEvent {
  readonly id: number;
  readonly startDateLocal: string;
  readonly category: string;
  readonly type?: string | null;
  readonly name?: string | null;
  readonly description?: string | null;
  readonly movingTime?: number | null;
  readonly icuTrainingLoad?: number | null;
  readonly workoutDoc?: unknown;
  readonly tags?: readonly string[] | null;
  readonly externalId?: string | null;
}

export type CreateFailure =
  | { readonly error: ApiError; readonly lands: boolean }
  | { readonly throws: true; readonly lands: boolean };

export interface FakeCalendarSetup {
  readonly timezone?: string | null;
  readonly events?: readonly FakeEvent[];
  readonly oddDayEntries?: readonly unknown[];
  readonly athleteError?: ApiError;
  readonly listError?: ApiError;
  readonly recoveryListError?: ApiError;
  readonly getError?: ApiError;
  readonly getBody?: unknown;
  readonly createFailure?: CreateFailure;
  readonly createdBody?: unknown;
  readonly holdCreatesUntil?: number;
}

export interface FakeIntervals extends IntervalsPort {
  readonly sent: readonly NewWorkoutEvent[];
  readonly calendar: readonly FakeEvent[];
  readonly requests: readonly string[];
}

const FIRST_EVENT_ID = 9001;

export function fakeIntervals(setup: FakeCalendarSetup = {}): FakeIntervals {
  const calendar: FakeEvent[] = [...(setup.events ?? [])];
  const sent: NewWorkoutEvent[] = [];
  const requests: string[] = [];
  const timezone = "timezone" in setup ? setup.timezone : "Europe/Berlin";
  let lists = 0;
  const heldCreates: (() => void)[] = [];

  const land = (body: NewWorkoutEvent): FakeEvent => {
    const event: FakeEvent = { ...body, id: FIRST_EVENT_ID + calendar.length };
    calendar.push(event);
    return event;
  };

  return {
    sent,
    calendar,
    requests,
    athlete: {
      get: async () => {
        requests.push("athlete.get");
        return setup.athleteError === undefined
          ? ok({ id: "i12345678", name: "Test Athlete", timezone })
          : fail(setup.athleteError);
      },
    },
    events: {
      list: async (query) => {
        requests.push("events.list");
        lists += 1;
        const error = [setup.listError, setup.recoveryListError][lists - 1];
        if (error !== undefined) return fail(error);
        return ok([
          ...calendar.filter((event) => {
            const day = event.startDateLocal.slice(0, 10);
            return (
              day >= query.oldest &&
              day <= query.newest &&
              query.category.some((category) => category === event.category)
            );
          }),
          ...(setup.oddDayEntries ?? []),
        ]);
      },
      get: async (eventId) => {
        requests.push("events.get");
        if (setup.getError !== undefined) return fail(setup.getError);
        if (setup.getBody !== undefined) return ok(setup.getBody);
        const event = calendar.find((candidate) => candidate.id === eventId);
        return event === undefined ? fail(NOT_FOUND) : ok(event);
      },
      create: async (body) => {
        requests.push("events.create");
        sent.push(body);
        const holdUntil = setup.holdCreatesUntil;
        if (holdUntil !== undefined) {
          await new Promise<void>((release) => {
            heldCreates.push(release);
            if (heldCreates.length >= holdUntil) for (const held of heldCreates) held();
          });
        }
        const failure = setup.createFailure;
        if (failure === undefined) {
          const event = land(body);
          return ok(setup.createdBody === undefined ? event : setup.createdBody);
        }
        if (failure.lands) land(body);
        if ("throws" in failure) throw new Error("socket hang up");
        return fail(failure.error);
      },
    },
  };
}

function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

function fail(error: ApiError): Result<never> {
  return { ok: false, error };
}

export const UNAUTHORIZED: ApiError = {
  kind: "Unauthorized",
  status: 401,
  body: { error: "invalid key" },
};
export const FORBIDDEN: ApiError = { kind: "Forbidden", status: 403, body: null };
export const NOT_FOUND: ApiError = { kind: "NotFound", status: 404, body: null };
export const RATE_LIMIT: ApiError = {
  kind: "RateLimit",
  status: 429,
  retryAfterMs: 4500,
  body: null,
};
export const TIMEOUT: ApiError = { kind: "Timeout", message: "Request timed out after 10000ms" };
export const BAD_GATEWAY: ApiError = {
  kind: "Http",
  status: 502,
  statusText: "Bad Gateway",
  body: "<html>upstream trace at 10.0.0.7</html>",
};
export const BAD_REQUEST: ApiError = {
  kind: "Http",
  status: 400,
  statusText: "Bad Request",
  body: { error: "name too long", trace: "internal stack frame" },
};
export const CONFLICT: ApiError = {
  kind: "Http",
  status: 409,
  statusText: "Conflict",
  body: { message: "event already exists" },
};
export const UNPROCESSABLE: ApiError = {
  kind: "Http",
  status: 422,
  statusText: "Unprocessable Entity",
  body: { message: "movingTime must be positive" },
};
export const SERVER_ERROR: ApiError = {
  kind: "Http",
  status: 500,
  statusText: "Internal Server Error",
  body: null,
};
