import type { z } from "zod";
import type { CalendarDay, EventId, IntervalsPort, StoredWorkout } from "./calendar.js";

export interface CoachDeps {
  readonly intervals: IntervalsPort | undefined;
  readonly now: () => Date;
}

export interface RenderedReply {
  readonly isError: boolean;
  readonly text: string;
}

export interface CoachTool<N extends string = string> {
  readonly name: N;
  readonly title: string;
  readonly description: string;
  readonly inputSchema: z.ZodType;
  readonly readOnly: boolean;
  run(args: unknown, deps: CoachDeps): Promise<RenderedReply>;
}

const ANY_TOOL_REFUSALS = {
  not_configured:
    "INTERVALS_API_KEY is not set. Ask the athlete to add their intervals.icu API key in the plugin settings, then try again.",
  unauthorized:
    "intervals.icu rejected the API key. Ask the athlete to check it in the plugin settings.",
  forbidden: "The API key has no access to this calendar. Ask the athlete to check the key.",
  invalid_input:
    "The arguments do not match the tool's input schema. Fix what details lists and call again.",
} as const;

const CREATE_REFUSALS = {
  ...ANY_TOOL_REFUSALS,
  rate_limited:
    "intervals.icu is limiting requests. Nothing was saved. Wait retryAfterSeconds, then try again.",
  intervals_unavailable:
    "intervals.icu could not be reached or answered unexpectedly. Nothing was saved. Try again shortly.",
  invalid_date: "Use a real calendar date written YYYY-MM-DD.",
  past_date_refused: "Use today's date in the athlete's time zone, or a later date.",
  timezone_missing:
    "The athlete's intervals.icu profile has no valid time zone, so today's date is unknown. Ask them to set it in intervals.icu settings.",
  invalid_workout: "Nothing was saved. Fix the steps that details names and call again.",
  rejected: "intervals.icu refused the workout and nothing was saved. details has its reason.",
} as const satisfies Record<string, string>;

const READ_BACK_FAILED =
  "That says nothing about whether the workout is on the calendar. If it still fails after a created reply, tell the athlete intervals.icu accepted the workout but reading it back failed, give the reason, and ask them to check the calendar.";

const READ_REFUSALS = {
  ...ANY_TOOL_REFUSALS,
  rate_limited: `intervals.icu is limiting requests, so the read failed. Wait retryAfterSeconds, then call get_workout again. ${READ_BACK_FAILED}`,
  intervals_unavailable: `intervals.icu could not be reached or answered unexpectedly, so the read failed. Call get_workout again shortly. ${READ_BACK_FAILED}`,
  not_found: "No workout with that eventId is on the calendar.",
} as const satisfies Record<string, string>;

export type CreateRefusalCode = keyof typeof CREATE_REFUSALS;

export type ReadRefusalCode = keyof typeof READ_REFUSALS;

export type RefusalCode = CreateRefusalCode | ReadRefusalCode;

export interface Refusal<C extends RefusalCode = RefusalCode> {
  readonly status: "refused";
  readonly code: C;
  readonly details: string;
  readonly retryAfterSeconds?: number;
}

export type RefusalOf<C extends RefusalCode> = C extends RefusalCode ? Refusal<C> : never;

export function refusal<C extends RefusalCode>(
  code: C,
  details: string,
  retryAfterSeconds?: number,
): Refusal<C> {
  return retryAfterSeconds === undefined
    ? { status: "refused", code, details }
    : { status: "refused", code, details, retryAfterSeconds };
}

export interface DayWorkout {
  readonly eventId: EventId;
  readonly name: string | null;
  readonly type: string | null;
  readonly externalId: string | null;
  readonly isPluginWorkout: boolean;
}

export type CreateReply =
  | {
      readonly status: "created";
      readonly tool: string;
      readonly eventId: EventId;
      readonly date: CalendarDay;
      readonly name: string;
      readonly externalId: string;
      readonly recovered: boolean;
    }
  | {
      readonly status: "duplicate_found";
      readonly tool: string;
      readonly date: CalendarDay;
      readonly name: string;
      readonly existing: readonly [DayWorkout, ...DayWorkout[]];
    }
  | {
      readonly status: "uncertain";
      readonly tool: string;
      readonly date: CalendarDay;
      readonly name: string;
      readonly externalId: string;
      readonly confirmDuplicate: boolean;
      readonly details: string;
    }
  | RefusalOf<CreateRefusalCode>;

export type ReadReply =
  | { readonly status: "found"; readonly workout: StoredWorkout }
  | RefusalOf<ReadRefusalCode>;

export type ReplyStatus = CreateReply["status"] | ReadReply["status"];

export const REPLY_IS_ERROR = {
  created: false,
  duplicate_found: false,
  uncertain: true,
  refused: true,
  found: false,
} as const satisfies Record<ReplyStatus, boolean>;

export function isReplyStatus(value: string): value is ReplyStatus {
  return Object.hasOwn(REPLY_IS_ERROR, value);
}

export function isRefusalCode(value: string): value is RefusalCode {
  return Object.hasOwn(CREATE_REFUSALS, value) || Object.hasOwn(READ_REFUSALS, value);
}

export function renderCreateReply(reply: CreateReply): RenderedReply {
  switch (reply.status) {
    case "created":
      return rendered(reply.status, "yes", reply, createdNext(reply.eventId));
    case "duplicate_found":
      return rendered(
        reply.status,
        "no",
        reply,
        `Ask the athlete whether to add another ${reply.name} on ${reply.date}. Only after a yes, call ${reply.tool} again with the same arguments and confirmDuplicate: true.`,
      );
    case "uncertain":
      return rendered(reply.status, "unknown", reply, uncertainNext(reply));
    case "refused":
      return rendered(reply.status, "no", reply, CREATE_REFUSALS[reply.code]);
    default: {
      const unreachable: never = reply;
      return unreachable;
    }
  }
}

export function renderReadReply(reply: ReadReply): RenderedReply {
  switch (reply.status) {
    case "found":
      return rendered(
        reply.status,
        undefined,
        reply,
        "Show a one-line summary (date, name, moving time), say whether the chart will render when chartWillRender is not null, then show description in a code block.",
      );
    case "refused":
      return rendered(reply.status, undefined, reply, READ_REFUSALS[reply.code]);
    default: {
      const unreachable: never = reply;
      return unreachable;
    }
  }
}

function uncertainNext(reply: Extract<CreateReply, { status: "uncertain" }>): string {
  const { tool, externalId } = reply;
  const retry = `Call ${tool} again with the same arguments and no confirmDuplicate: a duplicate_found reply listing externalId ${externalId} means it was saved (read it back with get_workout)`;
  return reply.confirmDuplicate
    ? `${retry}; a duplicate_found reply that does not list ${externalId} means it was not saved and the athlete's earlier yes still stands, so call ${tool} once more with the same arguments and confirmDuplicate: true.`
    : `Do not call ${tool} with confirmDuplicate. ${retry}; a created reply means it was not saved before and is saved now.`;
}

function createdNext(eventId: EventId): string {
  return `Call get_workout with eventId ${eventId} and show the read-back before telling the athlete the workout is saved.`;
}

function rendered(
  status: ReplyStatus,
  saved: "yes" | "no" | "unknown" | undefined,
  reply: object,
  next: string,
): RenderedReply {
  const head = saved === undefined ? { status } : { status, saved };
  return {
    isError: REPLY_IS_ERROR[status],
    text: JSON.stringify({ ...head, ...reply, next }),
  };
}
