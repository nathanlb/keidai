import type { RunStepKind, TerminationOutcome } from "@keidai/shared";
import type { RunStore } from "../runs/run-store.js";

export interface RunReporter {
  startRun(input: {
    id: string;
    assignee: string;
    goal: string;
    startedAt: string;
  }): void;
  recordStep(step: {
    id?: string;
    kind: RunStepKind;
    toolName?: string;
    toolCallId?: string;
    text?: string;
    inputPreview?: string;
    status?: "ok" | "error" | "approval_required";
    approvalId?: string;
    charCount?: number;
  }): void;
  complete(outcome: TerminationOutcome): void;
}

/** Writes run visibility into Shaiden's local store (system of record). */
export function createLocalRunReporter(
  store: RunStore,
  runId: string,
): RunReporter {
  return {
    startRun(input) {
      store.createRun(input);
    },
    recordStep(step) {
      store.appendStep(runId, {
        timestamp: new Date().toISOString(),
        ...step,
      });
    },
    complete(outcome) {
      store.completeRun(runId, { outcome });
    },
  };
}
