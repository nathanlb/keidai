import type { RunListItem, RunStep } from "@keidai/shared";
import {
  formatTraceClock,
  formatTraceRelative,
} from "../../activity/utils/format-trace-time.js";
import { formatCompactDuration } from "../../home/utils/format-compact-duration.js";

export {
  formatTraceClock as formatRunClock,
  formatTraceRelative as formatRunRelative,
};

export function resolveRunDurationMs(
  run: RunListItem,
  steps?: readonly RunStep[],
  now = Date.now(),
): number | undefined {
  if (
    typeof run.activeElapsedMs === "number" &&
    Number.isFinite(run.activeElapsedMs) &&
    run.activeElapsedMs > 0
  ) {
    return run.activeElapsedMs;
  }

  const startedAt = new Date(run.startedAt).getTime();
  if (Number.isNaN(startedAt)) {
    return undefined;
  }

  if (run.status === "running") {
    return Math.max(0, now - startedAt);
  }

  const lastStep = steps?.[steps.length - 1];
  if (!lastStep) {
    return undefined;
  }

  const endedAt = new Date(lastStep.timestamp).getTime();
  if (Number.isNaN(endedAt)) {
    return undefined;
  }

  const span = endedAt - startedAt;
  if (!Number.isFinite(span) || span <= 0) {
    return undefined;
  }

  return span;
}

export function formatRunDuration(
  run: RunListItem,
  steps?: readonly RunStep[],
  now = Date.now(),
): string {
  const durationMs = resolveRunDurationMs(run, steps, now);
  if (durationMs === undefined) {
    return "—";
  }

  return formatCompactDuration(durationMs);
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
