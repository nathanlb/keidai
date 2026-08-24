import { cn } from "@keidai/ui";
import type { GoalVerdict } from "../../home/types/home-digest.js";
import { verdictLabel } from "../../home/utils/derive-goal-verdict.js";

const PILL_CLASS: Record<GoalVerdict, string> = {
  met: "bg-[color-mix(in_srgb,var(--green-600)_18%,transparent)] text-(--green-600)",
  partial: "bg-[color-mix(in_srgb,var(--amber-500)_18%,transparent)] text-amber-500",
  missed: "bg-[color-mix(in_srgb,var(--destructive)_16%,transparent)] text-destructive",
  awaiting: "bg-muted text-muted-foreground",
};

export function GoalVerdictPill({
  verdict,
  className,
}: {
  verdict: GoalVerdict;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold",
        PILL_CLASS[verdict],
        className,
      )}
    >
      {verdictLabel(verdict)}
    </span>
  );
}
