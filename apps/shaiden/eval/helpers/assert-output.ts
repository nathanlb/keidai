import assert from "node:assert/strict";
import type { OutputRunStep, RunStep } from "@keidai/shared";

export function outputSteps(steps: readonly RunStep[]): OutputRunStep[] {
  return steps.filter((step): step is OutputRunStep => step.kind === "output");
}

export function assertHasOutputStep(
  steps: readonly RunStep[],
  scenario: string,
  contentsMatch?: RegExp,
): void {
  const outputs = outputSteps(steps);
  assert.ok(
    outputs.length >= 1,
    `output eval "${scenario}" expected at least one output step, got kinds=[${steps.map((step) => step.kind).join(", ")}]`,
  );

  if (!contentsMatch) {
    return;
  }

  assert.ok(
    outputs.some((step) => contentsMatch.test(step.text)),
    `output eval "${scenario}" expected an output step matching ${contentsMatch}, got ${JSON.stringify(outputs.map((step) => step.text))}`,
  );
}

export function assertNoOutputStep(
  steps: readonly RunStep[],
  scenario: string,
): void {
  const outputs = outputSteps(steps);
  assert.equal(
    outputs.length,
    0,
    `output eval "${scenario}" expected no output steps, got ${JSON.stringify(outputs.map((step) => step.text))}`,
  );
}
