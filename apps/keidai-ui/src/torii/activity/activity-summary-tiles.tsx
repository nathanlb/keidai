import { Card, CardContent } from "@keidai/ui";
import type { TraceStatsResponse } from "@keidai/shared";

function SummaryTile({
  label,
  value,
  detail,
  tone = "default",
  showSuccessDot = false,
  showDestructiveDot = false,
}: {
  label: string;
  value: string;
  detail?: string;
  tone?: "default" | "success" | "destructive";
  showSuccessDot?: boolean;
  showDestructiveDot?: boolean;
}) {
  const valueClass =
    tone === "success"
      ? "text-success"
      : tone === "destructive"
        ? "text-destructive"
        : "text-foreground";

  return (
    <Card className="shadow-none">
      <CardContent className="px-4 py-3.5">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {showSuccessDot ? (
            <span className="size-1.5 rounded-full bg-success" aria-hidden />
          ) : null}
          {showDestructiveDot ? (
            <span
              className="size-1.5 rounded-full bg-destructive"
              aria-hidden
            />
          ) : null}
          {label}
        </div>
        <div
          className={`mt-0.5 text-2xl font-bold tracking-tight tabular-nums ${valueClass}`}
        >
          {value}
        </div>
        {detail ? (
          <div className="mt-0.5 font-mono text-[11px] text-muted-foreground">
            {detail}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function formatPercent(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

export function ActivitySummaryTiles({
  stats,
}: {
  stats: TraceStatsResponse;
}) {
  const callsInWindow = Math.round(
    (stats.callsPerMinute * stats.windowMs) / 60_000,
  );
  const successCount = Math.round(callsInWindow * stats.successRate);
  const deniedTotal = stats.deniedCount + stats.linkingRequiredCount;

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <SummaryTile
        label="Calls · last 15 min"
        value={callsInWindow.toLocaleString()}
        detail={`≈ ${Math.round(stats.callsPerMinute)} / min`}
      />
      <SummaryTile
        label="Success rate"
        value={formatPercent(stats.successRate)}
        detail={`${successCount.toLocaleString()} / ${callsInWindow.toLocaleString()} ok`}
        tone="success"
        showSuccessDot
      />
      <SummaryTile
        label="p95 latency"
        value={
          stats.p95DurationMs === null
            ? "—"
            : `${stats.p95DurationMs.toLocaleString()}`
        }
        detail={
          stats.p50DurationMs === null
            ? undefined
            : `p50 ${stats.p50DurationMs.toLocaleString()} ms`
        }
      />
      <SummaryTile
        label="Denied / blocked"
        value={deniedTotal.toLocaleString()}
        detail={`${stats.deniedCount} denied · ${stats.linkingRequiredCount} linking`}
        tone={deniedTotal > 0 ? "destructive" : "default"}
        showDestructiveDot={deniedTotal > 0}
      />
    </div>
  );
}
