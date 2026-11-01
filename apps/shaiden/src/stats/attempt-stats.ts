import type {
  AgentStatsResponse,
  StatsFailureReason,
  StatsFilters,
  StatsOutcomeCount,
  StatsPercentiles,
  StatsProportion,
  StatsToolProfile,
  StatsUsage,
  StatsVerdict,
  TaskStatsResponse,
} from "@keidai/shared";
import { wilsonInterval } from "./wilson.js";

const MIN_RATE_SAMPLE = 10;
const VERDICT_COVERAGE_FLOOR = 0.2;

export interface AttemptStatsRow {
  runId: string;
  taskId: string;
  taskRevisionHash: string;
  agentId: string;
  modelId: string | null;
  personaVersion: number | null;
  outcome: string;
  outcomeReason: string | null;
  failureClass: string | null;
  maxIterations: number | null;
  timeoutSeconds: number | null;
  iterationsUsed: number;
  activeMs: number;
  approvalRequestCount: number;
  rejectionCount: number;
  inputTokens: number | null;
  outputTokens: number | null;
  cost: number | null;
  verdict: "up" | "down" | null;
  toolCounts: Record<string, { calls?: number; errors?: number }>;
  startedAt: string;
  retained: boolean;
}

export function proportion(
  successes: number,
  eligible: number,
): Omit<StatsProportion, "leading"> {
  if (eligible < MIN_RATE_SAMPLE) {
    return { successes, eligible, rate: null, low: null, high: null };
  }
  const interval = wilsonInterval(successes, eligible);
  return {
    successes,
    eligible,
    rate: successes / eligible,
    low: interval.low,
    high: interval.high,
  };
}

export function withLeading<
  T extends { proportion: Omit<StatsProportion, "leading"> },
>(groups: readonly T[]): Array<T & { proportion: StatsProportion }> {
  return groups.map((group) => {
    const { low } = group.proportion;
    const others = groups.filter((other) => other !== group);
    const leading =
      low !== null &&
      others.length > 0 &&
      others.every(
        (other) =>
          other.proportion.high !== null && low > other.proportion.high,
      );
    return {
      ...group,
      proportion: { ...group.proportion, leading },
    };
  });
}

function isPlatform(row: AttemptStatsRow): boolean {
  return row.failureClass === "platform";
}

function isSuccess(row: AttemptStatsRow): boolean {
  return row.outcome === "goal_met";
}

function percentile(values: readonly number[], p: number): number | null {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const index = (sorted.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const low = sorted[lower] ?? 0;
  const high = sorted[upper] ?? low;
  if (lower === upper) {
    return low;
  }
  return low * (upper - index) + high * (index - lower);
}

function limitStats(
  rows: readonly AttemptStatsRow[],
  limitOf: (row: AttemptStatsRow) => number | null,
  usedOf: (row: AttemptStatsRow) => number,
): StatsPercentiles | null {
  const limited = rows.filter((row) => limitOf(row) !== null);
  if (limited.length === 0) {
    return null;
  }
  const capped = limited.filter(
    (row) => usedOf(row) >= (limitOf(row) ?? 0),
  ).length;
  return {
    limitedAttempts: limited.length,
    p50: percentile(limited.map(usedOf), 0.5),
    p90: percentile(limited.map(usedOf), 0.9),
    cappedShare:
      limited.length >= MIN_RATE_SAMPLE ? capped / limited.length : null,
  };
}

function usageOf(rows: readonly AttemptStatsRow[]): StatsUsage {
  const withTokens = rows.filter(
    (row) => row.inputTokens !== null || row.outputTokens !== null,
  );
  const withCost = rows.filter((row) => row.cost !== null);
  const mean = (values: number[]): number | null =>
    values.length === 0
      ? null
      : values.reduce((sum, value) => sum + value, 0) / values.length;
  return {
    attemptsWithTokens: withTokens.length,
    attemptsWithCost: withCost.length,
    inputTokensPerAttempt: mean(withTokens.map((row) => row.inputTokens ?? 0)),
    outputTokensPerAttempt: mean(
      withTokens.map((row) => row.outputTokens ?? 0),
    ),
    costPerAttempt: mean(withCost.map((row) => row.cost ?? 0)),
  };
}

function verdictOf(
  rows: readonly AttemptStatsRow[],
  eligible: readonly AttemptStatsRow[],
): StatsVerdict {
  const withVerdict = rows.filter((row) => row.verdict !== null).length;
  const coverage =
    rows.length >= MIN_RATE_SAMPLE ? withVerdict / rows.length : null;
  const confirmed = eligible.filter(
    (row) => isSuccess(row) && row.verdict === "up",
  ).length;
  const showConfirmed =
    coverage !== null &&
    coverage >= VERDICT_COVERAGE_FLOOR &&
    eligible.length >= MIN_RATE_SAMPLE;
  return {
    withVerdict,
    coverage,
    operatorConfirmedSuccess: showConfirmed
      ? { ...proportion(confirmed, eligible.length), leading: false }
      : null,
    disagreementCount: rows.filter(
      (row) => isSuccess(row) && row.verdict === "down",
    ).length,
  };
}

function groupProportion(
  rows: readonly AttemptStatsRow[],
): Omit<StatsProportion, "leading"> {
  const eligible = rows.filter((row) => !isPlatform(row));
  const successes = eligible.filter(isSuccess).length;
  return proportion(successes, eligible.length);
}

export function buildTaskStats(
  taskId: string,
  filters: StatsFilters,
  rows: readonly AttemptStatsRow[],
): TaskStatsResponse {
  const eligible = rows.filter((row) => !isPlatform(row));
  const outcomes = new Map<string, StatsOutcomeCount>();
  for (const row of rows) {
    const key = `${row.outcome}\0${row.failureClass ?? ""}`;
    const current = outcomes.get(key) ?? {
      outcome: row.outcome,
      failureClass: row.failureClass,
      count: 0,
    };
    current.count += 1;
    outcomes.set(key, current);
  }

  const agentModel = new Map<string, AttemptStatsRow[]>();
  for (const row of rows) {
    const key = `${row.agentId}\0${row.modelId ?? ""}`;
    const bucket = agentModel.get(key) ?? [];
    bucket.push(row);
    agentModel.set(key, bucket);
  }

  const reasons = new Map<
    string,
    { count: number; runId: string; retained: boolean }
  >();
  for (const row of rows) {
    if (!row.outcomeReason || isSuccess(row)) {
      continue;
    }
    const current = reasons.get(row.outcomeReason) ?? {
      count: 0,
      runId: row.runId,
      retained: row.retained,
    };
    current.count += 1;
    if (row.retained) {
      current.runId = row.runId;
      current.retained = true;
    }
    reasons.set(row.outcomeReason, current);
  }
  const failureReasons: StatsFailureReason[] = [...reasons.entries()]
    .map(([reason, value]) => ({ reason, ...value }))
    .sort((left, right) => right.count - left.count)
    .slice(0, 8);

  const tools = toolProfile(rows);
  const approvals = rows.reduce(
    (sum, row) => sum + row.approvalRequestCount,
    0,
  );
  const rejections = rows.reduce((sum, row) => sum + row.rejectionCount, 0);

  return {
    taskId,
    filters,
    attemptCount: rows.length,
    platformFailureCount: rows.filter(isPlatform).length,
    outcomes: [...outcomes.values()].sort(
      (left, right) => right.count - left.count,
    ),
    byAgentModel: withLeading(
      [...agentModel.entries()].map(([key, bucket]) => {
        const [agentId, modelId] = key.split("\0");
        return {
          agentId: agentId ?? "",
          modelId: modelId ? modelId : null,
          proportion: groupProportion(bucket),
        };
      }),
    ),
    failureReasons,
    tools,
    iterations: limitStats(
      rows,
      (row) => row.maxIterations,
      (row) => row.iterationsUsed,
    ),
    timeouts: limitStats(
      rows,
      (row) => row.timeoutSeconds,
      (row) => row.activeMs / 1000,
    ),
    duration: {
      p50: percentile(
        rows.map((row) => row.activeMs),
        0.5,
      ),
      p90: percentile(
        rows.map((row) => row.activeMs),
        0.9,
      ),
    },
    approvals: {
      perAttempt: rows.length > 0 ? approvals / rows.length : null,
      rejectionRate:
        rows.length >= MIN_RATE_SAMPLE && approvals > 0
          ? rejections / approvals
          : null,
      operatorWaitMs: null,
    },
    usage: usageOf(rows),
    verdict: verdictOf(rows, eligible),
  };
}

export function buildAgentStats(
  agentId: string,
  filters: StatsFilters,
  rows: readonly AttemptStatsRow[],
): AgentStatsResponse {
  const byKey = (keyOf: (row: AttemptStatsRow) => string) => {
    const groups = new Map<string, AttemptStatsRow[]>();
    for (const row of rows) {
      const key = keyOf(row);
      const bucket = groups.get(key) ?? [];
      bucket.push(row);
      groups.set(key, bucket);
    }
    return groups;
  };

  const byTask = withLeading(
    [...byKey((row) => row.taskId).entries()].map(([taskId, bucket]) => ({
      taskId,
      proportion: groupProportion(bucket),
    })),
  ).sort((left, right) => {
    const leftRate = left.proportion.rate ?? 1;
    const rightRate = right.proportion.rate ?? 1;
    return leftRate - rightRate;
  });

  const tools = new Map<string, { calls: number; errors: number }>();
  for (const row of rows) {
    for (const [toolName, counts] of Object.entries(row.toolCounts)) {
      const current = tools.get(toolName) ?? { calls: 0, errors: 0 };
      current.calls += counts.calls ?? 0;
      current.errors += counts.errors ?? 0;
      tools.set(toolName, current);
    }
  }

  const weeks = new Map<string, { attempts: number; successes: number }>();
  for (const row of rows) {
    const week = weekStart(row.startedAt);
    const current = weeks.get(week) ?? { attempts: 0, successes: 0 };
    current.attempts += 1;
    if (isSuccess(row) && !isPlatform(row)) {
      current.successes += 1;
    }
    weeks.set(week, current);
  }

  return {
    agentId,
    filters,
    attemptCount: rows.length,
    platformFailureCount: rows.filter(isPlatform).length,
    byTask,
    byPersonaVersion: withLeading(
      [...byKey((row) => String(row.personaVersion ?? "")).entries()].map(
        ([key, bucket]) => ({
          personaVersion: key.length === 0 ? null : Number(key),
          proportion: groupProportion(bucket),
        }),
      ),
    ),
    byModel: withLeading(
      [...byKey((row) => row.modelId ?? "").entries()].map(([key, bucket]) => ({
        modelId: key.length === 0 ? null : key,
        proportion: groupProportion(bucket),
      })),
    ),
    tools: [...tools.entries()]
      .map(([toolName, counts]) => ({ toolName, ...counts }))
      .sort((left, right) => right.calls - left.calls),
    weekly: [...weeks.entries()]
      .map(([week, counts]) => ({ week, ...counts }))
      .sort((left, right) => left.week.localeCompare(right.week)),
    usage: usageOf(rows),
    verdict: verdictOf(
      rows,
      rows.filter((row) => !isPlatform(row)),
    ),
  };
}

function toolProfile(rows: readonly AttemptStatsRow[]): StatsToolProfile[] {
  const tools = new Map<
    string,
    { attemptsUsing: number; calls: number; errors: number }
  >();
  for (const row of rows) {
    for (const [toolName, counts] of Object.entries(row.toolCounts)) {
      const calls = counts.calls ?? 0;
      const errors = counts.errors ?? 0;
      const current = tools.get(toolName) ?? {
        attemptsUsing: 0,
        calls: 0,
        errors: 0,
      };
      if (calls > 0) {
        current.attemptsUsing += 1;
      }
      current.calls += calls;
      current.errors += errors;
      tools.set(toolName, current);
    }
  }
  return [...tools.entries()]
    .map(([toolName, counts]) => ({
      toolName,
      ...counts,
      attemptShare:
        rows.length >= MIN_RATE_SAMPLE
          ? counts.attemptsUsing / rows.length
          : null,
      callsPerAttempt: rows.length > 0 ? counts.calls / rows.length : null,
      errorRate:
        counts.calls >= MIN_RATE_SAMPLE ? counts.errors / counts.calls : null,
    }))
    .sort((left, right) => right.calls - left.calls);
}

function weekStart(iso: string): string {
  const date = new Date(iso);
  const day = date.getUTCDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  date.setUTCDate(date.getUTCDate() + mondayOffset);
  return date.toISOString().slice(0, 10);
}
