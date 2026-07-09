import type { TerminationOutcome } from "@keidai/shared";

const OUTCOME_LABELS: Record<TerminationOutcome["status"], string> = {
  goal_met: "Goal met",
  iteration_exhausted: "Iteration exhausted",
  timeout: "Timeout",
  human_reject: "Human reject",
  failed: "Failed",
};

export function formatTerminationOutcome(outcome: TerminationOutcome): string {
  if (outcome.status === "failed") {
    return `${OUTCOME_LABELS.failed}: ${outcome.reason}`;
  }
  return OUTCOME_LABELS[outcome.status];
}

export function terminationOutcomeBadgeVariant(
  outcome: TerminationOutcome,
): "default" | "secondary" | "destructive" | "outline" {
  switch (outcome.status) {
    case "goal_met":
      return "default";
    case "human_reject":
    case "timeout":
    case "iteration_exhausted":
      return "secondary";
    case "failed":
      return "destructive";
  }
}
