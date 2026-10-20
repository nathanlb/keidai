import { cn } from "@keidai/ui";
import type { GoalVerdict } from "../../home/types/home-digest.js";
import { verdictLabel } from "../../home/utils/derive-goal-verdict.js";

const PILL_CLASS: Record<GoalVerdict, string> = {
  met: "bg-success-fill/20 text-success",
  partial: "bg-warning-fill/20 text-warning",
  missed: "bg-error-fill/15 text-destructive",
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
        `
          inline-flex items-center rounded-pill px-2 py-0.5 text-[11px]
          font-semibold
        `,
        PILL_CLASS[verdict],
        className,
      )}
    >
      {verdictLabel(verdict)}
    </span>
  );
}
