import type { TraceOutcome } from "@keidai/shared";

export interface TraceOutcomeMeta {
  label: string;
  accentClass: string;
  badgeClass: string;
  dotClass?: string;
}

export const TRACE_OUTCOME_META: Record<TraceOutcome, TraceOutcomeMeta> = {
  success: {
    label: "ok",
    accentClass: "bg-success",
    badgeClass: "border-transparent bg-secondary text-secondary-foreground",
    dotClass: "bg-success",
  },
  error: {
    label: "backend error",
    accentClass: "bg-warning",
    badgeClass: "border-border bg-background text-foreground",
    dotClass: "bg-warning",
  },
  denied: {
    label: "denied",
    accentClass: "bg-destructive",
    badgeClass:
      "border-transparent bg-destructive text-destructive-foreground",
    dotClass: "bg-destructive",
  },
  linking_required: {
    label: "linking required",
    accentClass: "bg-warning",
    badgeClass: "border-border bg-background text-foreground",
  },
};

export type OutcomeFilter = TraceOutcome | "all";

export function formatOutcomeLabel(outcome: TraceOutcome): string {
  return TRACE_OUTCOME_META[outcome].label;
}
