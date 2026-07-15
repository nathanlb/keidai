import { randomUUID } from "node:crypto";
import type { RunStep, RunStepKind } from "@keidai/shared";

export function createRunStep(
  step: {
    id?: string;
    timestamp: string;
    kind: RunStepKind;
  } & Record<string, unknown>,
): RunStep {
  return {
    ...step,
    id: step.id ?? randomUUID(),
  } as RunStep;
}
