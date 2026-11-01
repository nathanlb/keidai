import {
  resolveTaskLimits,
  type FailureClass,
  type RunStep,
  type Task,
  type TerminationOutcome,
} from "@keidai/shared";
import { taskRevisionHash } from "./task-revision-hash.js";

export type AttemptKind = "initial" | "follow_up";

export interface ToolAttemptCounts {
  calls: number;
  errors: number;
}

/** Counters already stored for earlier outcomes of the same run. */
export interface PriorAttempt {
  attemptIndex: number;
  kind: AttemptKind;
  iterationsUsed: number;
  activeMs: number;
}

export interface AttemptRunSource {
  id: string;
  taskId: string;
  task: Task;
  assignee: string;
  startedAt: string;
  modelId: string | null;
  personaVersion: number | null;
  agentOwnerId: string | null;
}

export interface AttemptFact {
  runId: string;
  attemptIndex: number;
  kind: AttemptKind;
  taskId: string;
  agentId: string;
  agentOwnerId: string | null;
  modelId: string | null;
  personaVersion: number | null;
  taskRevisionHash: string;
  maxIterations: number | null;
  timeoutSeconds: number | null;
  startedAt: string;
  endedAt: string;
  activeMs: number;
  iterationsUsed: number;
  outcome: TerminationOutcome["status"];
  outcomeReason: string | null;
  /** Null when the outcome step predates failure classes, or is not a failure. */
  failureClass: FailureClass | null;
  toolCounts: Record<string, ToolAttemptCounts>;
  /** Tool calls that waited on approval, whether later approved or rejected. */
  approvalRequestCount: number;
  rejectionCount: number;
  /** Iterations and active time were derived from steps, not the live budget. */
  backfilled: boolean;
}

function orderedSteps(steps: readonly RunStep[]): RunStep[] {
  return [...steps].sort((left, right) => {
    const byTime = left.timestamp.localeCompare(right.timestamp);
    if (byTime !== 0) {
      return byTime;
    }
    return left.id.localeCompare(right.id);
  });
}

function segmentEndingAt(
  steps: readonly RunStep[],
  outcomeStepId: string,
): {
  segment: RunStep[];
  outcome: Extract<RunStep, { kind: "outcome" }>;
  hadPreviousOutcome: boolean;
  /** 1-based position of this outcome among the outcomes still in the log. */
  outcomeOrdinal: number;
} {
  const ordered = orderedSteps(steps);
  const outcomeIndex = ordered.findIndex((step) => step.id === outcomeStepId);
  if (outcomeIndex < 0) {
    throw new Error(`outcome step ${outcomeStepId} is not in the run log`);
  }
  const outcome = ordered[outcomeIndex];
  if (!outcome || outcome.kind !== "outcome") {
    throw new Error(`step ${outcomeStepId} is not an outcome`);
  }

  let start = 0;
  let hadPreviousOutcome = false;
  for (let index = outcomeIndex - 1; index >= 0; index -= 1) {
    if (ordered[index]?.kind === "outcome") {
      hadPreviousOutcome = true;
      start = index + 1;
      break;
    }
  }

  const outcomeOrdinal = ordered
    .slice(0, outcomeIndex + 1)
    .filter((step) => step.kind === "outcome").length;

  return {
    segment: ordered.slice(start, outcomeIndex + 1),
    outcome,
    hadPreviousOutcome,
    outcomeOrdinal,
  };
}

/**
 * Earlier attempts whose usage is still in the run's live counters: the most
 * recent follow-up (which reset them) and every resume after it.
 */
function attemptsSinceBudgetReset(
  previousAttempts: readonly PriorAttempt[],
): PriorAttempt[] {
  const ordered = [...previousAttempts].sort(
    (left, right) => left.attemptIndex - right.attemptIndex,
  );
  let start = 0;
  for (let index = ordered.length - 1; index >= 0; index -= 1) {
    if (ordered[index]?.kind === "follow_up") {
      start = index;
      break;
    }
  }
  return ordered.slice(start);
}

function toolCounts(
  steps: readonly RunStep[],
): Record<string, ToolAttemptCounts> {
  const counts = new Map<string, ToolAttemptCounts>();
  const entry = (toolName: string | undefined): ToolAttemptCounts => {
    const name = toolName && toolName.length > 0 ? toolName : "unknown";
    const existing = counts.get(name);
    if (existing) {
      return existing;
    }
    const created = { calls: 0, errors: 0 };
    counts.set(name, created);
    return created;
  };

  for (const step of steps) {
    if (step.kind === "tool_dispatch") {
      entry(step.toolName).calls += 1;
    } else if (step.kind === "tool_result" && step.status === "error") {
      entry(step.toolName).errors += 1;
    }
  }

  return Object.fromEntries(
    [...counts.entries()].sort(([left], [right]) => left.localeCompare(right)),
  );
}

/**
 * Wall clock of the segment minus time parked on approval. Approximate:
 * backfilled rows are flagged so stats can treat the number as such.
 */
export function approximateActiveMs(
  segment: readonly RunStep[],
  startedAt: string,
  endedAt: string,
): number {
  const start = Date.parse(startedAt);
  const end = Date.parse(endedAt);
  const work = segment.filter((step) => step.kind !== "outcome");
  let parked = 0;
  for (let index = 0; index < work.length; index += 1) {
    const step = work[index];
    if (!step || step.kind !== "waiting_approval") {
      continue;
    }
    const next = work[index + 1];
    const nextAt = next ? Date.parse(next.timestamp) : end;
    parked += Math.max(0, nextAt - Date.parse(step.timestamp));
  }
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return 0;
  }
  return Math.max(0, end - start - parked);
}

function failureClassOf(
  outcome: Extract<RunStep, { kind: "outcome" }>,
): FailureClass | null {
  switch (outcome.failureClass) {
    case "platform":
    case "agent":
    case "limit":
    case "human":
      return outcome.failureClass;
    default:
      return null;
  }
}

function nonNegative(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.trunc(value));
}

/**
 * One attempt fact for an outcome step.
 *
 * `liveBudget` is the run's counters at the moment the outcome is recorded.
 * Follow-ups reset those counters, so the snapshot is this attempt's own
 * usage. A resume after `stopped` does not reset them, so the fact stores the
 * delta from the attempts since the last reset. Omit `liveBudget` to derive
 * both numbers from steps (backfill); those rows are marked `backfilled`.
 *
 * Kind is `follow_up` when the attempt opens with an operator message after an
 * earlier outcome, and `initial` otherwise. A resume after stop has no
 * operator message; a message queued while the run is parked lands mid-attempt
 * and does not start a new one.
 *
 * The index is the next one after the stored rows, or the outcome's position
 * in the log when that is higher (earlier outcomes predate this table).
 */
export function buildAttemptFact(input: {
  run: AttemptRunSource;
  steps: readonly RunStep[];
  outcomeStepId: string;
  previousAttempts: readonly PriorAttempt[];
  liveBudget?: { iterationsUsed: number; activeElapsedMs: number };
}): AttemptFact {
  const { segment, outcome, hadPreviousOutcome, outcomeOrdinal } =
    segmentEndingAt(input.steps, input.outcomeStepId);
  const opener = segment[0];
  const followUpMessage =
    hadPreviousOutcome && opener?.kind === "user_message" ? opener : undefined;
  const kind: AttemptKind = followUpMessage ? "follow_up" : "initial";
  const firstWork = segment.find((step) => step.kind !== "outcome");
  const startedAt = followUpMessage
    ? followUpMessage.timestamp
    : hadPreviousOutcome
      ? (firstWork?.timestamp ?? outcome.timestamp)
      : input.run.startedAt;

  const limits = resolveTaskLimits(input.run.task);
  const attemptIndex = Math.max(
    input.previousAttempts.reduce(
      (max, prior) => Math.max(max, prior.attemptIndex),
      0,
    ) + 1,
    outcomeOrdinal,
  );

  let iterationsUsed: number;
  let activeMs: number;
  let backfilled: boolean;
  if (input.liveBudget) {
    backfilled = false;
    const resume =
      kind === "initial" &&
      hadPreviousOutcome &&
      input.previousAttempts.length > 0;
    if (resume) {
      const counted = attemptsSinceBudgetReset(input.previousAttempts);
      const priorIterations = counted.reduce(
        (sum, prior) => sum + prior.iterationsUsed,
        0,
      );
      const priorActive = counted.reduce(
        (sum, prior) => sum + prior.activeMs,
        0,
      );
      iterationsUsed = nonNegative(
        input.liveBudget.iterationsUsed - priorIterations,
      );
      activeMs = nonNegative(input.liveBudget.activeElapsedMs - priorActive);
    } else {
      iterationsUsed = nonNegative(input.liveBudget.iterationsUsed);
      activeMs = nonNegative(input.liveBudget.activeElapsedMs);
    }
  } else {
    backfilled = true;
    iterationsUsed = segment.filter((step) => step.kind === "model").length;
    activeMs = approximateActiveMs(segment, startedAt, outcome.timestamp);
  }

  const outcomeReason =
    outcome.outcomeReason && outcome.outcomeReason.length > 0
      ? outcome.outcomeReason
      : null;

  return {
    runId: input.run.id,
    attemptIndex,
    kind,
    taskId: input.run.taskId,
    agentId: input.run.assignee,
    agentOwnerId: input.run.agentOwnerId,
    modelId: input.run.modelId,
    personaVersion: input.run.personaVersion,
    taskRevisionHash: taskRevisionHash(input.run.task),
    maxIterations: limits.max_iterations,
    timeoutSeconds: limits.timeout_seconds,
    startedAt,
    endedAt: outcome.timestamp,
    activeMs,
    iterationsUsed,
    outcome: outcome.outcomeStatus,
    outcomeReason,
    failureClass: failureClassOf(outcome),
    toolCounts: toolCounts(segment),
    approvalRequestCount: segment.filter(
      (step) => step.kind === "waiting_approval",
    ).length,
    rejectionCount: outcome.outcomeStatus === "human_reject" ? 1 : 0,
    backfilled,
  };
}
