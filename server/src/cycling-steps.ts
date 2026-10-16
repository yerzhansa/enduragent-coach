import { z } from "zod";
import { NO_CONTROL_CHARACTERS, type Checked, type EventBody } from "./create-workout.js";

const stepTypeSchema = z.enum([
  "warmup",
  "steady",
  "ramp",
  "interval",
  "rest",
  "recovery",
  "cooldown",
  "freeride",
]);

const powerTargetSchema = z
  .object({
    kind: z.enum(["watts", "percent_ftp", "zone"]),
    value: z.number().positive().optional(),
    low: z.number().positive().optional(),
    high: z.number().positive().optional(),
  })
  .strict();

const cadenceTargetSchema = z
  .object({
    target: z.number().int().positive().optional(),
    low: z.number().int().positive().optional(),
    high: z.number().int().positive().optional(),
  })
  .strict();

const durationSchema = z
  .object({
    value: z.number().positive(),
    unit: z.enum(["seconds", "minutes"]),
  })
  .strict();

const simpleStepSchema = z
  .object({
    type: stepTypeSchema,
    duration: durationSchema,
    power: powerTargetSchema.optional(),
    cadence: cadenceTargetSchema.optional(),
    label: z
      .string()
      .max(120)
      .regex(NO_CONTROL_CHARACTERS, "no line breaks or control characters")
      .optional(),
  })
  .strict();

const setStepSchema = z
  .object({
    type: z.literal("set"),
    repeat: z.number().int().min(1).max(20),
    interval: simpleStepSchema,
    recovery: simpleStepSchema,
  })
  .strict();

export const cyclingStepsField = z
  .array(z.union([simpleStepSchema, setStepSchema]))
  .min(1)
  .max(40)
  .describe(
    "Ordered steps. A step is warmup/steady/interval/ramp/recovery/rest/cooldown/freeride, or a set " +
      "{type:'set', repeat, interval, recovery}. Durations use seconds or minutes. Power targets: " +
      "{kind:'percent_ftp'|'watts'|'zone', value} or {kind, low, high}. Ramps need low and high. " +
      "Every step except freeride and rest needs a power target.",
  );

export type CyclingSteps = z.output<typeof cyclingStepsField>;

type SimpleStep = z.output<typeof simpleStepSchema>;
type StepType = SimpleStep["type"];
type PowerTarget = z.output<typeof powerTargetSchema>;
type CadenceTarget = z.output<typeof cadenceTargetSchema>;
type Duration = z.output<typeof durationSchema>;

const ZONES = [1, 2, 3, 4, 5, 6, 7] as const;
type Zone = (typeof ZONES)[number];

const ZONE_MIDPOINT_PERCENT: Readonly<Record<Zone, number>> = {
  1: 45,
  2: 65,
  3: 83,
  4: 98,
  5: 113,
  6: 136,
  7: 160,
};

const MAX_WATTS = 1500;
const MAX_PERCENT_FTP = 200;
const STEPS_WITHOUT_POWER: ReadonlySet<StepType> = new Set(["freeride", "rest"]);

type AbsoluteKind = "watts" | "percent_ftp";

type ParsedPower =
  | { readonly shape: "single"; readonly kind: AbsoluteKind; readonly value: number }
  | {
      readonly shape: "range";
      readonly kind: AbsoluteKind;
      readonly low: number;
      readonly high: number;
    }
  | { readonly shape: "zone"; readonly zone: Zone }
  | { readonly shape: "zone-range"; readonly low: Zone; readonly high: Zone };

type ParsedCadence =
  | { readonly shape: "single"; readonly rpm: number }
  | { readonly shape: "range"; readonly low: number; readonly high: number };

interface ParsedSimpleStep {
  readonly type: StepType;
  readonly duration: Duration;
  readonly power: ParsedPower | undefined;
  readonly cadence: ParsedCadence | undefined;
  readonly label: string | undefined;
}

type ParsedStep =
  | { readonly kind: "simple"; readonly step: ParsedSimpleStep }
  | {
      readonly kind: "set";
      readonly repeat: number;
      readonly interval: ParsedSimpleStep;
      readonly recovery: ParsedSimpleStep;
    };

type Parsed<T> = { readonly value: T; readonly issues: readonly string[] };

function toZone(value: number, path: string, issues: string[]): Zone | undefined {
  const zone = ZONES.find((candidate) => candidate === value);
  if (zone === undefined) issues.push(`${path}: zone must be an integer 1-7, got ${value}`);
  return zone;
}

function boundIssues(power: PowerTarget, path: string): string[] {
  const issues: string[] = [];
  const check = (value: number | undefined, name: string): void => {
    if (value === undefined) return;
    if (power.kind === "watts" && value > MAX_WATTS) {
      issues.push(`${path}.power.${name}: ${value}w exceeds sanity bound ${MAX_WATTS}w`);
    }
    if (power.kind === "percent_ftp" && value > MAX_PERCENT_FTP) {
      issues.push(`${path}.power.${name}: ${value}% exceeds sanity bound ${MAX_PERCENT_FTP}%`);
    }
  };
  check(power.value, "value");
  check(power.low, "low");
  check(power.high, "high");
  return issues;
}

function parsePower(
  power: PowerTarget,
  isRamp: boolean,
  path: string,
): Parsed<ParsedPower | undefined> {
  const issues = boundIssues(power, path);
  const { kind, value, low, high } = power;
  if (low !== undefined && high !== undefined) {
    if (low > high) issues.push(`${path}: power.low (${low}) > power.high (${high})`);
    if (kind !== "zone") return { value: { shape: "range", kind, low, high }, issues };
    const lowZone = toZone(low, `${path}.power.low`, issues);
    const highZone = toZone(high, `${path}.power.high`, issues);
    return {
      value:
        lowZone === undefined || highZone === undefined
          ? undefined
          : { shape: "zone-range", low: lowZone, high: highZone },
      issues,
    };
  }
  if (isRamp)
    return {
      value: undefined,
      issues: [...issues, `${path}: ramp requires power.low and power.high`],
    };
  if (value === undefined) {
    return {
      value: undefined,
      issues: [...issues, `${path}: power requires 'value' or 'low'+'high'`],
    };
  }
  if (kind !== "zone") return { value: { shape: "single", kind, value }, issues };
  const zone = toZone(value, `${path}.power.value`, issues);
  return { value: zone === undefined ? undefined : { shape: "zone", zone }, issues };
}

function parseCadence(cadence: CadenceTarget, path: string): Parsed<ParsedCadence | undefined> {
  const { target, low, high } = cadence;
  if ((low === undefined) !== (high === undefined)) {
    return { value: undefined, issues: [`${path}: cadence range requires both 'low' and 'high'`] };
  }
  if (low !== undefined && high !== undefined) {
    return low > high
      ? { value: undefined, issues: [`${path}: cadence.low (${low}) > cadence.high (${high})`] }
      : { value: { shape: "range", low, high }, issues: [] };
  }
  return target === undefined
    ? { value: undefined, issues: [`${path}: cadence requires 'target' or 'low'+'high'`] }
    : { value: { shape: "single", rpm: target }, issues: [] };
}

function parseSimpleStep(step: SimpleStep, path: string): Parsed<ParsedSimpleStep> {
  const issues: string[] = [];
  let power: ParsedPower | undefined;
  if (step.power === undefined) {
    if (!STEPS_WITHOUT_POWER.has(step.type))
      issues.push(`${path}: ${step.type} step requires a power target`);
  } else {
    const parsed = parsePower(step.power, step.type === "ramp", path);
    issues.push(...parsed.issues);
    power = parsed.value;
  }
  let cadence: ParsedCadence | undefined;
  if (step.cadence !== undefined) {
    const parsed = parseCadence(step.cadence, path);
    issues.push(...parsed.issues);
    cadence = parsed.value;
  }
  return {
    value: { type: step.type, duration: step.duration, power, cadence, label: step.label },
    issues,
  };
}

function parseSteps(steps: CyclingSteps): Checked<readonly ParsedStep[]> {
  const issues: string[] = [];
  const parsed = steps.map((step, index): ParsedStep => {
    const path = `steps[${index}]`;
    if (step.type !== "set") {
      const simple = parseSimpleStep(step, path);
      issues.push(...simple.issues);
      return { kind: "simple", step: simple.value };
    }
    const interval = parseSimpleStep(step.interval, `${path}.interval`);
    const recovery = parseSimpleStep(step.recovery, `${path}.recovery`);
    issues.push(...interval.issues, ...recovery.issues);
    return { kind: "set", repeat: step.repeat, interval: interval.value, recovery: recovery.value };
  });
  return issues.length === 0
    ? { ok: true, value: parsed }
    : { ok: false, details: issues.join("; ") };
}

function toSeconds(duration: Duration): number {
  return duration.unit === "seconds" ? duration.value : duration.value * 60;
}

function formatDuration(duration: Duration): string {
  const total = Math.round(toSeconds(duration));
  if (total < 60) return `${total}s`;
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return seconds === 0 ? `${minutes}m` : `${minutes}m${seconds}`;
}

function formatPower(power: ParsedPower, isRamp: boolean): string {
  const prefix = isRamp ? "ramp " : "";
  switch (power.shape) {
    case "single":
      return power.kind === "percent_ftp" ? `${power.value}%` : `${power.value}w`;
    case "range":
      return `${prefix}${power.low}-${power.high}${power.kind === "percent_ftp" ? "%" : "w"}`;
    case "zone":
      return `Z${power.zone}`;
    case "zone-range":
      return isRamp
        ? `${prefix}${ZONE_MIDPOINT_PERCENT[power.low]}-${ZONE_MIDPOINT_PERCENT[power.high]}%`
        : `Z${power.low}-Z${power.high}`;
    default: {
      const unreachable: never = power;
      return unreachable;
    }
  }
}

function formatCadence(cadence: ParsedCadence): string {
  return cadence.shape === "single" ? `${cadence.rpm}rpm` : `${cadence.low}-${cadence.high}rpm`;
}

function formatStepLine(step: ParsedSimpleStep): string {
  const parts = [formatDuration(step.duration)];
  if (step.power !== undefined) parts.push(formatPower(step.power, step.type === "ramp"));
  if (step.cadence !== undefined) parts.push(formatCadence(step.cadence));
  const body = parts.join(" ");
  return step.label === undefined || step.label === "" ? `- ${body}` : `- ${body} ${step.label}`;
}

function sectionLabel(step: ParsedStep): string {
  if (step.kind === "set") return "Main set";
  if (step.step.type === "warmup") return "Warmup";
  if (step.step.type === "cooldown") return "Cooldown";
  return "Main set";
}

function stepSeconds(step: ParsedStep): number {
  return step.kind === "set"
    ? (toSeconds(step.interval.duration) + toSeconds(step.recovery.duration)) * step.repeat
    : toSeconds(step.step.duration);
}

function formatSteps(steps: readonly ParsedStep[]): EventBody {
  const lines: string[] = [];
  let currentLabel: string | undefined;
  let previous: ParsedStep | undefined;
  for (const step of steps) {
    const label = sectionLabel(step);
    const startsSection = label !== currentLabel;
    const isSet = step.kind === "set";
    if ((startsSection || isSet || previous?.kind === "set") && lines.length > 0) lines.push("");
    if (startsSection) {
      lines.push(step.kind === "set" ? `${label} ${step.repeat}x` : label);
      currentLabel = label;
    } else if (step.kind === "set") {
      lines.push(`${step.repeat}x`);
    }
    if (step.kind === "set") {
      lines.push(formatStepLine(step.interval), formatStepLine(step.recovery));
    } else {
      lines.push(formatStepLine(step.step));
    }
    previous = step;
  }
  return {
    description: lines.join("\n"),
    movingTimeSeconds: Math.round(steps.reduce((total, step) => total + stepSeconds(step), 0)),
  };
}

export function formatCyclingSteps(steps: CyclingSteps): Checked<EventBody> {
  const parsed = parseSteps(steps);
  return parsed.ok ? { ok: true, value: formatSteps(parsed.value) } : parsed;
}
