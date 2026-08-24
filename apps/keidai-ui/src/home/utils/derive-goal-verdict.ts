import type { RunListItem, TerminationOutcome } from "@keidai/shared";
import type { GoalVerdict } from "../types/home-digest.js";

export function verdictFromOutcome(
  outcome: TerminationOutcome | undefined,
  running: boolean,
): GoalVerdict {
  if (running || !outcome) {
    return "awaiting";
  }
  if (outcome.status === "goal_met") {
    return "met";
  }
  return "missed";
}

export function deriveGoalVerdict(run: RunListItem): GoalVerdict {
  return verdictFromOutcome(run.outcome, run.status === "running");
}

export function verdictLabel(verdict: GoalVerdict): string {
  switch (verdict) {
    case "met":
      return "Met";
    case "partial":
      return "Partial";
    case "missed":
      return "Missed";
    case "awaiting":
      return "Awaiting";
  }
}
