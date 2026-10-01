import type { Logger, Task } from "@keidai/shared";
import {
  nextTaskPollDelayMs,
  type ParkedTaskPoll,
} from "../mcp/poll-mcp-task.js";
import type { ParkedMcpTask } from "../runs/types/run-repository.js";
import type { RunStore } from "../runs/run-store.js";
import { completeRunWithOutcomeStep } from "./run-completion.js";
import type { SandboxClient } from "../sandbox/sandbox-client.js";
import {
  DEFAULT_RUN_LEASE_MS,
  isRunLeaseError,
  leaseExpiresAt,
} from "./run-lease.js";
import type { ConversationEntry } from "./types/conversation-history.js";

export interface ResumeParkedHarnessRun {
  runId: string;
  initialHistory: ConversationEntry[];
  task: Task;
  runStore: RunStore;
}

/**
 * Poll ownerless parked runs, then claim one only after its Torii task is
 * terminal. A non-terminal poll schedules `next_poll_at` and leaves the run
 * unclaimed. `input_required` and fatal poll errors fail the run from here.
 */
export async function resumeParkedHarnessRuns(input: {
  runStore: RunStore;
  resumeHarnessRun: (
    args: ResumeParkedHarnessRun,
  ) => { done: Promise<unknown> } | Promise<{ done: Promise<unknown> }>;
  pollParkedTask: (
    parked: ParkedMcpTask,
    task: Task,
  ) => Promise<ParkedTaskPoll>;
  replicaId: string;
  leaseMs?: number;
  logger: Logger;
  sandbox?: SandboxClient;
  now?: () => number;
  nextPollDelayMs?: (pollIntervalMs?: number) => number;
}): Promise<number> {
  const nowMs = (input.now ?? Date.now)();
  const nowIso = new Date(nowMs).toISOString();
  const delayFor = input.nextPollDelayMs ?? nextTaskPollDelayMs;
  const parkedRuns = await input.runStore.listClaimableParkedMcpTasks(nowIso);
  if (parkedRuns.length === 0) {
    return 0;
  }

  input.logger.info("boot.resuming_parked_runs", {
    count: parkedRuns.length,
  });

  let resumed = 0;
  for (const parked of parkedRuns) {
    const run = await input.runStore.getRun(parked.runId);
    if (!run || run.status !== "running") {
      input.logger.error("boot.resume_parked_skipped", {
        runId: parked.runId,
        reason: !run ? "missing_run" : run.status,
      });
      continue;
    }

    const poll = await input.pollParkedTask(parked, run.task);
    if (poll.kind === "pending") {
      const delayMs = delayFor(poll.pollIntervalMs ?? parked.pollIntervalMs);
      await input.runStore.setNextPollAt(
        parked.runId,
        new Date(nowMs + delayMs).toISOString(),
      );
      if (poll.pollIntervalMs != null) {
        await input.runStore.setParkedMcpTask(parked.runId, {
          mcpTaskId: parked.mcpTaskId,
          pollIntervalMs: poll.pollIntervalMs,
        });
      }
      continue;
    }

    if (poll.kind === "failed") {
      const claimed = await input.runStore.claimRun(
        parked.runId,
        input.replicaId,
        leaseExpiresAt(nowMs, input.leaseMs ?? DEFAULT_RUN_LEASE_MS),
        nowIso,
      );
      if (!claimed) {
        input.logger.info("boot.resume_parked_not_claimed", {
          runId: parked.runId,
        });
        continue;
      }
      await completeRunWithOutcomeStep(
        input.runStore,
        parked.runId,
        {
          status: "failed",
          reason: poll.reason,
        },
        input.sandbox,
      );
      input.logger.error("boot.resume_parked_failed", {
        runId: parked.runId,
        error: poll.reason,
      });
      continue;
    }

    const history = await input.runStore.getConversationHistory(parked.runId);
    if (!history) {
      input.logger.error("boot.resume_parked_skipped", {
        runId: parked.runId,
        reason: "missing_history",
      });
      continue;
    }

    const { done } = await input.resumeHarnessRun({
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
