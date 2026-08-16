import type { Logger, Task } from "@keidai/shared";
import type { ConversationEntry } from "./types/conversation-history.js";
import type { RunStore } from "../runs/run-store.js";

export interface ResumeParkedHarnessRun {
  runId: string;
  initialHistory: ConversationEntry[];
  task: Task;
  runStore: RunStore;
}

/**
 * Re-attach in-flight gated tool calls after a Shaiden restart. Each parked
 * run still has a durable MCP task id; polling resumes without replaying
 * tools/call.
 */
export function resumeParkedHarnessRuns(input: {
  runStore: RunStore;
  resumeHarnessRun: (args: ResumeParkedHarnessRun) => {
    done: Promise<unknown>;
  };
  logger: Logger;
}): number {
  const parkedRuns = input.runStore.listParkedMcpTasks();
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
      input.logger.error("boot.resume_parked_failed", {
        runId: parked.runId,
        error: error instanceof Error ? error.message : String(error),
      });
    });
    resumed += 1;
  }

  return resumed;
}
