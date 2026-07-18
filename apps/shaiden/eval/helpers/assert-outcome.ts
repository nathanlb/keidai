import assert from "node:assert/strict";
import type { TerminationOutcome } from "@keidai/shared";

export function assertOutcome(
  actual: TerminationOutcome,
  expected: TerminationOutcome,
  scenario: string,
): void {
  assert.deepEqual(
    actual,
    expected,
    `termination eval "${scenario}" expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
  );
}

export function assertNotGoalMet(
  actual: TerminationOutcome,
  scenario: string,
): void {
  assert.notEqual(
    actual.status,
    "goal_met",
    `termination eval "${scenario}" must not resolve to goal_met`,
  );
}
