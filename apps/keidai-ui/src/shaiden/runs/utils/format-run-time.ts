import type { RunListItem, RunStep } from "@keidai/shared";
import {
  formatTraceClock,
  formatTraceRelative,
} from "../../../torii/activity/utils/format-trace-time.js";

export { formatTraceClock as formatRunClock, formatTraceRelative as formatRunRelative };

export function resolveRunDurationMs(
  run: RunListItem,
  steps?: readonly RunStep[],
  now = Date.now(),
): number | undefined {
  const startedAt = new Date(run.startedAt).getTime();
  if (Number.isNaN(startedAt)) {
    return undefined;
  }

  if (run.status === "running") {
    return Math.max(0, now - startedAt);
  }

  const lastStep = steps?.[steps.length - 1];
  const endedAt = lastStep
    ? new Date(lastStep.timestamp).getTime()
    : now;

  if (Number.isNaN(endedAt)) {
    return undefined;
  }

  return Math.max(0, endedAt - startedAt);
}

export function formatRunDuration(
  run: RunListItem,
  steps?: readonly RunStep[],
): string {
  const durationMs = resolveRunDurationMs(run, steps);
  if (durationMs === undefined) {
    return "—";
  }

  if (durationMs < 1000) {
    return `${durationMs} ms`;
  }

  const seconds = durationMs / 1000;
  if (seconds < 60) {
    return `${seconds.toFixed(1)} s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainder = Math.round(seconds % 60);
  return `${minutes}m ${remainder}s`;
}

export function countModelIterations(steps?: readonly RunStep[]): number {
  if (!steps) {
    return 0;
  }

  return steps.filter((step) => step.kind === "model").length;
}

export function formatRunIterations(
  run: RunListItem,
  steps?: readonly RunStep[],
): string {
  const iterations = steps ? countModelIterations(steps) : run.stepCount;
  return String(iterations);
}
