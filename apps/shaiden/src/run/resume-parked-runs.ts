import type { Logger, Task } from "@keidai/shared";
import type { ConversationEntry } from "./types/conversation-history.js";
import { isRunLeaseError } from "./run-lease.js";
import type { RunStore } from "../runs/run-store.js";

export interface ResumeParkedHarnessRun {
  runId: string;
  initialHistory: ConversationEntry[];
  task: Task;
  runStore: RunStore;
}

/**
 * Re-attach in-flight gated tool calls after a restart or when another
 * replica's lease has expired. Claim happens inside the harness so two
 * replicas cannot drive the same parked run.
 */
export function resumeParkedHarnessRuns(input: {
  runStore: RunStore;
  resumeHarnessRun: (args: ResumeParkedHarnessRun) => {
    done: Promise<unknown>;
  };
  logger: Logger;
  now?: () => number;
}): number {
  const nowIso = new Date((input.now ?? Date.now)()).toISOString();
  const parkedRuns = input.runStore.listClaimableParkedMcpTasks(nowIso);
  if (parkedRuns.length === 0) {
    return 0;
  }

  input.logger.info("boot.resuming_parked_runs", {
    count: parkedRuns.length,
  });

  let resumed = 0;
  for (const parked of parkedRuns) {
    const run = input.runStore.getRun(parked.runId);
    const history = input.runStore.getConversationHistory(parked.runId);
    if (!run || run.status !== "running" || !history) {
      input.logger.error("boot.resume_parked_skipped", {
        runId: parked.runId,
        reason: !run
          ? "missing_run"
          : !history
            ? "missing_history"
            : run.status,
      });
      continue;
    }

    const { done } = input.resumeHarnessRun({
      runId: parked.runId,
      initialHistory: history,
      task: run.task,
      runStore: input.runStore,
    });
    done.catch((error: unknown) => {
      if (isRunLeaseError(error)) {
        input.logger.info("boot.resume_parked_not_claimed", {
          runId: parked.runId,
        });
        return;
      }
      input.logger.error("boot.resume_parked_failed", {
        runId: parked.runId,
        error: error instanceof Error ? error.message : String(error),
      });
    });
    resumed += 1;
  }

  return resumed;
}
