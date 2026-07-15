import type { OutcomeRunStep, TerminationOutcome } from "@keidai/shared";
import type { RunStore } from "../runs/run-store.js";

export function outcomeStepFromTermination(
  outcome: TerminationOutcome,
): OutcomeRunStep {
  if (outcome.status === "failed") {
    return {
      id: "",
      timestamp: "",
      kind: "outcome",
      outcomeStatus: outcome.status,
      outcomeReason: outcome.reason,
    };
  }

  return {
    id: "",
    timestamp: "",
    kind: "outcome",
    outcomeStatus: outcome.status,
  };
}

export function completeRunWithOutcomeStep(
  store: RunStore,
  runId: string,
  outcome: TerminationOutcome,
): void {
  const { id: _id, timestamp: _timestamp, ...outcomeStep } =
    outcomeStepFromTermination(outcome);
  store.appendStep(runId, {
    timestamp: new Date().toISOString(),
    ...outcomeStep,
  });
  store.completeRun(runId, { outcome });
}
