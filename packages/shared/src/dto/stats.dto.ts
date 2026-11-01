/** Wilson 95% interval. Rate fields are null below 10 eligible attempts. */
export interface StatsProportion {
  successes: number;
  eligible: number;
  rate: number | null;
  low: number | null;
  high: number | null;
  /** True only when this group's interval sits entirely above every other group. */
  leading: boolean;
}

export interface StatsFilters {
  window: "7d" | "30d" | "90d" | "all";
  scope: "current" | "all";
  kind: "initial" | "follow_up" | "all";
}

export interface StatsOutcomeCount {
  outcome: string;
  failureClass: string | null;
  count: number;
}

export interface StatsFailureReason {
  reason: string;
  count: number;
  runId: string;
  retained: boolean;
}

export interface StatsToolProfile {
  toolName: string;
  attemptsUsing: number;
  calls: number;
  errors: number;
  /** Null below 10 attempts in the filtered set. */
  attemptShare: number | null;
  callsPerAttempt: number | null;
  errorRate: number | null;
}

export interface StatsPercentiles {
  /** Attempts that had the limit set. Null-limit attempts are excluded. */
  limitedAttempts: number;
  p50: number | null;
  p90: number | null;
  /** Share that hit the cap. Null below 10 limited attempts. */
  cappedShare: number | null;
}

export interface StatsUsage {
  attemptsWithTokens: number;
  attemptsWithCost: number;
  inputTokensPerAttempt: number | null;
  outputTokensPerAttempt: number | null;
  costPerAttempt: number | null;
}

export interface StatsVerdict {
  withVerdict: number;
  /** Null below 10 attempts. */
  coverage: number | null;
  /**
   * goal_met and thumbs-up. Null until verdict coverage is at least 20%
   * and there are 10 eligible attempts.
   */
  operatorConfirmedSuccess: StatsProportion | null;
  /** goal_met with a thumbs-down. Always a count. */
  disagreementCount: number;
}

export interface TaskStatsResponse {
  taskId: string;
  filters: StatsFilters;
  attemptCount: number;
  platformFailureCount: number;
  outcomes: StatsOutcomeCount[];
  byAgentModel: Array<{
    agentId: string;
    modelId: string | null;
    proportion: StatsProportion;
  }>;
  failureReasons: StatsFailureReason[];
  tools: StatsToolProfile[];
  iterations: StatsPercentiles | null;
  timeouts: StatsPercentiles | null;
  duration: { p50: number | null; p90: number | null };
  approvals: {
    perAttempt: number | null;
    rejectionRate: number | null;
    /** Not stored on the attempt. Left null rather than joined to expired run logs. */
    operatorWaitMs: null;
  };
  usage: StatsUsage;
  verdict: StatsVerdict;
}

export interface AgentStatsResponse {
  agentId: string;
  filters: StatsFilters;
  attemptCount: number;
  platformFailureCount: number;
  byTask: Array<{
    taskId: string;
    proportion: StatsProportion;
  }>;
  byPersonaVersion: Array<{
    personaVersion: number | null;
    proportion: StatsProportion;
  }>;
  byModel: Array<{
    modelId: string | null;
    proportion: StatsProportion;
  }>;
  tools: Array<{ toolName: string; calls: number; errors: number }>;
  weekly: Array<{
    week: string;
    attempts: number;
    successes: number;
  }>;
  usage: StatsUsage;
  verdict: StatsVerdict;
}
