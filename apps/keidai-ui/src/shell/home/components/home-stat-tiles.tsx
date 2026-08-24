import { Card, CardContent, cn } from "@keidai/ui";
import { formatPartialSub } from "../utils/format-home-copy.js";

function StatTile({
  label,
  value,
  sub,
  dotClass,
  testId,
}: {
  label: string;
  value: string;
  sub: string;
  dotClass: string;
  testId: string;
}) {
  return (
    <Card data-testid={testId} className="py-0 shadow-none">
      <CardContent className="px-4 py-3.5">
        <div className="flex items-center gap-[7px] text-xs text-muted-foreground">
          <span
            className={cn("size-[7px] shrink-0 rounded-full", dotClass)}
            aria-hidden
          />
          {label}
        </div>
        <div className="mt-[7px] text-2xl font-bold leading-none tracking-[-0.02em]">
          {value}
        </div>
        <div className="mt-1 truncate font-mono text-[11.5px] text-muted-foreground">
          {sub}
        </div>
      </CardContent>
    </Card>
  );
}

export function HomeStatTiles({
  awaitingYou,
  oldestParkedLabel,
  runningCount,
  runningAgentLabel,
  goalMet24h,
  partial24h,
  failed24h,
  failedTaskName,
}: {
  awaitingYou: number;
  oldestParkedLabel: string;
  runningCount: number;
  runningAgentLabel: string;
  goalMet24h: number;
  partial24h: number;
  failed24h: number;
  failedTaskName: string | null;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <StatTile
        testId="home-stat-awaiting"
        label="Awaiting you"
        value={String(awaitingYou)}
        sub={oldestParkedLabel}
        dotClass="bg-amber-500"
      />
      <StatTile
        testId="home-stat-running"
        label="Running"
        value={String(runningCount)}
        sub={runningAgentLabel}
        dotClass="bg-chart-1"
      />
      <StatTile
        testId="home-stat-goal-met"
        label="Goal met · 24h"
        value={String(goalMet24h)}
        sub={formatPartialSub(partial24h)}
        dotClass="bg-(--green-600)"
      />
      <StatTile
        testId="home-stat-failed"
        label="Failed · 24h"
        value={String(failed24h)}
        sub={failedTaskName ?? "none"}
        dotClass="bg-destructive"
      />
    </div>
  );
}
