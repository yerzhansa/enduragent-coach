import { formatCyclingSteps, type CyclingSteps } from "../../src/cycling-steps.js";
import type { EventBody } from "../../src/create-workout.js";

export function formatted(steps: CyclingSteps): EventBody {
  const result = formatCyclingSteps(steps);
  if (!result.ok) throw new Error(`expected valid steps, got: ${result.details}`);
  return result.value;
}

export function issues(steps: CyclingSteps): string {
  const result = formatCyclingSteps(steps);
  if (result.ok) throw new Error(`expected invalid steps, got: ${result.value.description}`);
  return result.details;
}
