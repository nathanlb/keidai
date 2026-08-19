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

export async function completeRunWithOutcomeStep(
  store: RunStore,
  runId: string,
  outcome: TerminationOutcome,
): Promise<void> {
  const { id: _id, timestamp: _timestamp, ...outcomeStep } =
    outcomeStepFromTermination(outcome);
  await store.appendStep(runId, {
    timestamp: new Date().toISOString(),
    ...outcomeStep,
  });
  await store.completeRun(runId, { outcome });
}
