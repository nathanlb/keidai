import { Card, CardContent } from "@keidai/ui";
import type { HomeGoalDay } from "../types/home-digest.js";

export function GoalCompletionCard({
  rateLabel,
  week,
}: {
  rateLabel: string;
  week: readonly HomeGoalDay[];
}) {
  return (
    <Card className="flex h-full flex-col overflow-hidden py-0 shadow-none">
      <CardContent className="flex h-full flex-col p-0">
        <div className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-[13px]">
          <span className="text-[13.5px] font-semibold">Goal completion</span>
          <span className="text-xs text-muted-foreground">last 7 days</span>
        </div>
        <div className="flex flex-1 flex-col px-4 pb-4 pt-[15px]">
          <div className="flex items-baseline gap-2">
            <span className="text-[28px] font-bold leading-none tracking-[-0.02em]">
              {rateLabel}
            </span>
            <span className="text-[12.5px] text-muted-foreground">
              of runs met their goal
            </span>
          </div>
          <div className="mt-4 flex min-h-[54px] flex-1 items-end gap-1">
            {week.map((day, index) => (
              <div
                key={`${day.label}-${index}`}
                className="flex h-full min-h-[54px] flex-1 flex-col justify-end gap-0.5"
              >
                <div
                  className="rounded-sm bg-destructive"
                  style={{ height: `${day.missedPct}%` }}
                />
                <div
                  className="rounded-sm bg-[color-mix(in_srgb,var(--green-600)_45%,transparent)]"
                  style={{ height: `${day.partialPct}%` }}
                />
                <div
                  className="rounded-sm bg-(--green-600)"
                  style={{ height: `${day.metPct}%` }}
                />
              </div>
            ))}
          </div>
          <div className="mt-1.5 flex gap-1">
            {week.map((day, index) => (
              <span
                key={`${day.label}-label-${index}`}
                className="flex-1 text-center font-mono text-[10px] text-muted-foreground"
              >
                {day.label}
              </span>
            ))}
          </div>
          <div className="mt-3.5 flex gap-3.5 border-t border-border pt-[13px] text-[11.5px] text-muted-foreground">
            <span className="flex items-center gap-[5px]">
              <span className="size-2 rounded-sm bg-(--green-600)" aria-hidden />
              Met
            </span>
            <span className="flex items-center gap-[5px]">
              <span
                className="size-2 rounded-sm bg-[color-mix(in_srgb,var(--green-600)_45%,transparent)]"
                aria-hidden
              />
              Partial
            </span>
            <span className="flex items-center gap-[5px]">
              <span className="size-2 rounded-sm bg-destructive" aria-hidden />
              Missed
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
