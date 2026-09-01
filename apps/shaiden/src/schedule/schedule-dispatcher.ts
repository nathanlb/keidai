import {
  isScheduleTrigger,
  nextRunAtIso,
  type Logger,
  type SavedTask,
  type Task,
} from "@keidai/shared";
import { TaskAlreadyRunningError } from "../runs/types/run-repository.js";
import type { RunStore } from "../runs/run-store.js";
import type { TaskRepository } from "../tasks/types/task-repository.js";

export const DEFAULT_SCHEDULE_MAX_SLEEP_MS = 30_000;
export const DEFAULT_SCHEDULE_CLAIM_MS = 30_000;
export const DEFAULT_SCHEDULE_DUE_WAKE_MS = 50;
export const DEFAULT_SCHEDULE_CLAIM_LIMIT = 10;

export function scheduleSleepMs(
  minNextRunAt: string | null,
  nowMs: number,
  maxSleepMs = DEFAULT_SCHEDULE_MAX_SLEEP_MS,
  dueWakeMs = DEFAULT_SCHEDULE_DUE_WAKE_MS,
): number {
  if (!minNextRunAt) {
    return maxSleepMs;
  }
  const dueIn = Date.parse(minNextRunAt) - nowMs;
  if (!Number.isFinite(dueIn) || dueIn <= 0) {
    return dueWakeMs;
  }
  return Math.min(dueIn, maxSleepMs);
}

function savedTaskToTask(saved: SavedTask): Task {
  return {
    goal: saved.goal,
    trigger: saved.trigger,
    assignee: saved.assignee,
    limits: saved.limits,
  };
}

function runningCoversSlot(
  startedAt: string | undefined,
  slotIso: string | null | undefined,
): boolean {
  if (!slotIso || !startedAt) {
    return true;
  }
  return Date.parse(startedAt) >= Date.parse(slotIso);
}

function warnIfRecurrenceExhausted(
  logger: Logger,
  trigger: SavedTask["trigger"],
  nextRunAt: string | null,
  taskId: string,
): void {
  if (nextRunAt === null && isScheduleTrigger(trigger) && trigger.recurrence) {
    logger.warn("schedule.next_exhausted", { taskId });
  }
}

export async function fireDueScheduledTasks(input: {
  taskRepository: TaskRepository;
  runStore: RunStore;
  startTaskRun: (input: { task: Task; taskId: string }) => Promise<unknown>;
  logger: Logger;
  now?: () => Date;
  claimMs?: number;
  claimLimit?: number;
}): Promise<number> {
  const now = input.now?.() ?? new Date();
  const claimMs = input.claimMs ?? DEFAULT_SCHEDULE_CLAIM_MS;
  const due = await input.taskRepository.claimDueTasks({
    now,
    claimUntil: new Date(now.getTime() + claimMs),
    limit: input.claimLimit ?? DEFAULT_SCHEDULE_CLAIM_LIMIT,
  });

  const running = await input.runStore.listRunningRuns();
  const runningByTaskId = new Map(running.map((run) => [run.taskId, run]));
  let started = 0;

  for (const saved of due) {
    const runningRef = runningByTaskId.get(saved.id);
    const fired = await fireClaimedTask({
      saved,
      runningStartedAt: runningRef?.startedAt,
      now,
      claimMs,
      taskRepository: input.taskRepository,
      startTaskRun: input.startTaskRun,
      logger: input.logger,
    });
    if (fired) {
      started += 1;
      runningByTaskId.set(saved.id, {
        id: "started",
        taskId: saved.id,
        startedAt: now.toISOString(),
      });
    }
  }

  return started;
}

async function fireClaimedTask(input: {
  saved: SavedTask;
  runningStartedAt: string | undefined;
  now: Date;
  claimMs: number;
  taskRepository: TaskRepository;
  startTaskRun: (input: { task: Task; taskId: string }) => Promise<unknown>;
  logger: Logger;
}): Promise<boolean> {
  const current = await input.taskRepository.get(input.saved.id);
  if (!current || current.archivedAt || current.scheduleFailedAt) {
    return false;
  }
  if (
    !current.nextRunAt ||
    Date.parse(current.nextRunAt) > input.now.getTime()
  ) {
    await input.taskRepository.deferScheduleClaim({
      taskId: current.id,
      claimUntil: null,
    });
    return false;
  }

  const nextAfterFire = nextRunAtIso(current.trigger, input.now, {
    after: true,
  });
  const advance = () => {
    warnIfRecurrenceExhausted(
      input.logger,
      current.trigger,
      nextAfterFire,
      current.id,
    );
    return input.taskRepository.recordScheduleSuccess({
      taskId: current.id,
      nextRunAt: nextAfterFire,
    });
  };

  if (input.runningStartedAt) {
    if (runningCoversSlot(input.runningStartedAt, current.nextRunAt)) {
      input.logger.info("schedule.skipped_busy", { taskId: current.id });
      await advance();
      return false;
    }
    input.logger.info("schedule.deferred_busy", { taskId: current.id });
    await input.taskRepository.deferScheduleClaim({
      taskId: current.id,
      claimUntil: new Date(input.now.getTime() + input.claimMs),
    });
    return false;
  }

  try {
    await input.startTaskRun({
      task: savedTaskToTask(current),
      taskId: current.id,
    });
    await advance();
    input.logger.info("schedule.started", { taskId: current.id });
    return true;
  } catch (error) {
    if (error instanceof TaskAlreadyRunningError) {
      input.logger.info("schedule.skipped_busy", { taskId: current.id });
      await advance();
      return false;
    }
    const message = error instanceof Error ? error.message : String(error);
    const outcome = await input.taskRepository.recordScheduleStartFailure({
      taskId: current.id,
      error: message,
      retryUntil: new Date(input.now.getTime() + input.claimMs),
      now: input.now,
    });
    if (outcome === "failed") {
      input.logger.error("schedule.start_failed_terminal", {
        taskId: current.id,
        error: message,
      });
    } else {
      input.logger.error("schedule.start_failed", {
        taskId: current.id,
        error: message,
      });
    }
    return false;
  }
}

class WakeableSleep {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private resolve: (() => void) | null = null;

  wait(ms: number): Promise<void> {
    this.clear();
    return new Promise((resolve) => {
      this.resolve = resolve;
      if (ms <= 0) {
        queueMicrotask(() => this.fire());
        return;
      }
      this.timer = setTimeout(() => this.fire(), ms);
      this.timer.unref();
    });
  }

  notify(): void {
    this.fire();
  }

  stop(): void {
    this.fire();
  }

  private fire(): void {
    this.clear();
    const resolve = this.resolve;
    this.resolve = null;
    resolve?.();
  }

  private clear(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}

export function startScheduleDispatcher(input: {
  taskRepository: TaskRepository;
  runStore: RunStore;
  startTaskRun: (input: { task: Task; taskId: string }) => Promise<unknown>;
  logger: Logger;
  now?: () => Date;
  maxSleepMs?: number;
  claimMs?: number;
  dueWakeMs?: number;
  claimLimit?: number;
}): { notify: () => void; stop: () => void } {
  const sleep = new WakeableSleep();
  let stopped = false;
  const maxSleepMs = input.maxSleepMs ?? DEFAULT_SCHEDULE_MAX_SLEEP_MS;
  const dueWakeMs = input.dueWakeMs ?? DEFAULT_SCHEDULE_DUE_WAKE_MS;

  const loop = async () => {
    while (!stopped) {
      let delay = maxSleepMs;
      try {
        await fireDueScheduledTasks(input);
        if (stopped) {
          return;
        }
        const now = input.now?.() ?? new Date();
        const minNext = await input.taskRepository.peekMinNextRunAt();
        delay = scheduleSleepMs(
          minNext,
          now.getTime(),
          maxSleepMs,
          dueWakeMs,
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        input.logger.error("schedule.tick_failed", { error: message });
      }
      if (stopped) {
        return;
      }
      await sleep.wait(delay);
    }
  };

  void loop();

  return {
    notify: () => sleep.notify(),
    stop: () => {
      stopped = true;
      sleep.stop();
    },
  };
}
