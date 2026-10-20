import type { GoalVerdict } from "../types/home-digest.js";

export function verdictTextClass(verdict: GoalVerdict): string {
  switch (verdict) {
    case "met":
      return "text-success";
    case "partial":
      return "text-[color-mix(in_srgb,var(--success)_60%,var(--muted-foreground))]";
    case "missed":
      return "text-destructive";
    case "awaiting":
      return "text-warning";
  }
}

export function verdictDotClass(verdict: GoalVerdict): string {
  switch (verdict) {
    case "met":
      return "bg-success-fill";
    case "partial":
      return "bg-[color-mix(in_srgb,var(--success-fill)_60%,var(--muted-foreground))]";
    case "missed":
      return "bg-error-fill";
    case "awaiting":
      return "bg-warning-fill";
  }
}
