import type { RunStepKind, Task, TerminationOutcome } from "@keidai/shared";
import type { RunStore } from "../runs/run-store.js";

export interface RunReporter {
  startRun(input: {
    id: string;
    taskId: string;
    task: Task;
    assignee: string;
    goal: string;
    startedAt: string;
    personaVersion?: number;
    persona?: string;
  }): Promise<void>;
  recordStep(step: {
    id?: string;
    kind: RunStepKind;
    toolName?: string;
    toolCallId?: string;
    text?: string;
    inputPreview?: string;
    outputPreview?: string;
    status?: "ok" | "error" | "approval_required";
    approvalId?: string;
    charCount?: number;
    traceId?: string;
  }): Promise<void>;
  complete(outcome: TerminationOutcome): Promise<void>;
}

/** Writes run visibility into Shaiden's local store (system of record). */
export function createLocalRunReporter(
  store: RunStore,
  runId: string,
): RunReporter {
  return {
    async startRun(input) {
      await store.createRun(input);
    },
    async recordStep(step) {
      await store.appendStep(runId, {
        timestamp: new Date().toISOString(),
        ...step,
      });
    },
    async complete(outcome) {
      await store.completeRun(runId, { outcome });
    },
  };
}
