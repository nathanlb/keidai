import { Card, CardContent } from "@keidai/ui";
import type { HomeGoalDay } from "../types/home-digest.js";

function weekHasCompletedRuns(week: readonly HomeGoalDay[]): boolean {
  return week.some(
    (day) => day.metPct > 0 || day.partialPct > 0 || day.missedPct > 0,
  );
}

export function GoalCompletionCard({
  rateLabel,
  week,
}: {
  rateLabel: string;
  week: readonly HomeGoalDay[];
}) {
  const hasWeekData = weekHasCompletedRuns(week);

  return (
    <Card className="flex h-full flex-col overflow-hidden py-0 shadow-none">
      <CardContent className="flex h-full flex-col p-0">
        <div
          className="
          flex shrink-0 items-center gap-2 border-b border-border px-4 py-3.25
        "
        >
          <h2 className="text-[13.5px] font-semibold">Goal completion</h2>
          <span className="text-xs text-muted-foreground">last 7 days</span>
        </div>
        <div className="flex flex-1 flex-col px-4 pt-3.75 pb-4">
          <div className="flex items-baseline gap-2">
            {hasWeekData ? (
              <>
                <span
                  className="
                  font-display text-[28px] leading-none font-bold
                  tracking-[-0.02em] lining-nums tabular-nums
                "
                >
                  {rateLabel}
                </span>
                <span className="text-[12.5px] text-muted-foreground">
                  of runs met their goal
                </span>
              </>
            ) : (
              <span className="text-[13.5px] text-muted-foreground">
                No completed runs in the last 7 days
              </span>
            )}
          </div>
          <div className="mt-4 flex min-h-13.5 flex-1 items-end gap-1">
            {week.map((day, index) => (
              <div
                key={`${day.label}-${index}`}
                className="
                  flex h-full min-h-13.5 flex-1 flex-col justify-end gap-0.5
                "
              >
                <div
                  className="rounded-sm bg-error-fill"
                  style={{ height: `${day.missedPct}%` }}
                />
                <div
                  className="
                    rounded-sm
                    bg-success-fill/45
                  "
                  style={{ height: `${day.partialPct}%` }}
                />
                <div
                  className="rounded-sm bg-success-fill"
                  style={{ height: `${day.metPct}%` }}
                />
              </div>
            ))}
          </div>
          <div className="mt-1.5 flex gap-1">
            {week.map((day, index) => (
              <span
                key={`${day.label}-label-${index}`}
                className="
                  flex-1 text-center font-mono text-[10px] text-muted-foreground
                "
              >
                {day.label}
              </span>
            ))}
          </div>
          <div
            className="
            mt-3.5 flex gap-3.5 border-t border-border pt-3.25 text-[11.5px]
            text-muted-foreground
          "
          >
            <span className="flex items-center gap-1.25">
              <span className="size-2 rounded-sm bg-success-fill" aria-hidden />
              Met
            </span>
            <span className="flex items-center gap-1.25">
              <span
                className="
                  size-2 rounded-sm
                  bg-success-fill/45
                "
                aria-hidden
              />
              Partial
            </span>
            <span className="flex items-center gap-1.25">
              <span className="size-2 rounded-sm bg-error-fill" aria-hidden />
              Missed
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
