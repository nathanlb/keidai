import type { OutcomeRunStep, TerminationOutcome } from "@keidai/shared";
import type { RunStore } from "../runs/run-store.js";
import type { SandboxClient } from "../sandbox/sandbox-client.js";

export function outcomeStepFromTermination(
  outcome: TerminationOutcome,
): OutcomeRunStep {
  return {
    id: "",
    timestamp: "",
    kind: "outcome",
    outcomeStatus: outcome.status,
    ...(outcome.status === "failed" ? { outcomeReason: outcome.reason } : {}),
    ...(outcome.failureClass ? { failureClass: outcome.failureClass } : {}),
  };
}

export async function completeRunWithOutcomeStep(
  store: RunStore,
  runId: string,
  outcome: TerminationOutcome,
  sandbox?: SandboxClient,
): Promise<void> {
  const {
    id: _id,
    timestamp: _timestamp,
    ...outcomeStep
  } = outcomeStepFromTermination(outcome);
  await store.appendStep(runId, {
    timestamp: new Date().toISOString(),
    ...outcomeStep,
  });
  await store.completeRun(runId, { outcome });
  if (!sandbox) {
    return;
  }
  try {
    await sandbox.deleteRun(runId);
  } catch {
    // The workspace sweeper retries a missed DELETE.
  }
}
