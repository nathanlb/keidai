import type { GoalVerdict } from "../types/home-digest.js";

export function verdictTextClass(verdict: GoalVerdict): string {
  switch (verdict) {
    case "met":
      return "text-(--green-600)";
    case "partial":
      return "text-[color-mix(in_srgb,var(--green-600)_60%,var(--muted-foreground))]";
    case "missed":
      return "text-destructive";
    case "awaiting":
      return "text-amber-500";
  }
}

export function verdictDotClass(verdict: GoalVerdict): string {
  switch (verdict) {
    case "met":
      return "bg-(--green-600)";
    case "partial":
      return "bg-[color-mix(in_srgb,var(--green-600)_60%,var(--muted-foreground))]";
    case "missed":
      return "bg-destructive";
    case "awaiting":
      return "bg-amber-500";
  }
}
