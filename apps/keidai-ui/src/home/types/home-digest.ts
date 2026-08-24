export type GoalVerdict = "met" | "partial" | "missed" | "awaiting";

export type HomeAttentionKind = "approval" | "failed_run";

export type HomeAttentionCta =
  | { type: "approve"; approvalId: string }
  | { type: "retry"; taskId: string };

export interface HomeAttentionItem {
  id: string;
  kind: HomeAttentionKind;
  mark: string;
  tool: string;
  impact: string;
  context: string;
  parkedLabel: string;
  reviewHref: string;
  cta: HomeAttentionCta;
  ctaLabel: "Approve" | "Retry";
}

export interface HomeLiveRun {
  id: string;
  task: string;
  agent: string;
  elapsedLabel: string;
  stepText: string;
  progressPct: number;
  iterationLabel: string;
}

export interface HomeGoalDay {
  label: string;
  metPct: number;
  partialPct: number;
  missedPct: number;
}

export interface HomeRecentRun {
  id: string;
  task: string;
  agent: string;
  verdict: GoalVerdict;
  durationLabel: string;
  whenLabel: string;
}

export interface HomeScheduledTask {
  id: string;
  task: string;
  description: string;
  agent: string;
  trigger: string;
  lastVerdict: GoalVerdict | null;
  nextLabel: string;
  paused: boolean;
}

export type HomeAgentHealth = "healthy" | "failing" | "idle";

export interface HomeAgentCard {
  id: string;
  slug: string;
  name: string;
  initials: string;
  summary: string;
  taskLabel: string;
  toolLabel: string;
  health: HomeAgentHealth;
}

export interface HomeDigest {
  subtitle: string;
  attention: HomeAttentionItem[];
  awaitingYou: number;
  oldestParkedLabel: string;
  runningCount: number;
  runningAgentLabel: string;
  goalMet24h: number;
  partial24h: number;
  failed24h: number;
  failedTaskName: string | null;
  liveRuns: HomeLiveRun[];
  goalRateLabel: string;
  week: HomeGoalDay[];
  recentRuns: HomeRecentRun[];
  totalRunCount: number;
  scheduled: HomeScheduledTask[];
  pausedScheduledCount: number;
  agents: HomeAgentCard[];
}
