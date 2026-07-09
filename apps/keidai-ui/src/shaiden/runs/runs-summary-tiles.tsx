import { Card, CardContent } from "@keidai/ui";

function SummaryTile({
  label,
  value,
  tone = "default",
  showMutedDot = false,
  showWarningDot = false,
  showDestructiveDot = false,
}: {
  label: string;
  value: string;
  tone?: "default" | "destructive";
  showMutedDot?: boolean;
  showWarningDot?: boolean;
  showDestructiveDot?: boolean;
}) {
  const valueClass =
    tone === "destructive" ? "text-destructive" : "text-foreground";

  return (
    <Card className="shadow-none">
      <CardContent className="px-4 py-3.5">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {showMutedDot ? (
            <span className="size-1.5 rounded-full bg-muted-foreground" aria-hidden />
          ) : null}
          {showWarningDot ? (
            <span className="size-1.5 rounded-full bg-warning" aria-hidden />
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
      </CardContent>
    </Card>
  );
}

export function RunsSummaryTiles({
  runsToday,
  running,
  awaitingReview,
  failed,
}: {
  runsToday: number;
  running: number;
  awaitingReview: number;
  failed: number;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <SummaryTile label="Runs today" value={runsToday.toLocaleString()} />
      <SummaryTile
        label="Running"
        value={running.toLocaleString()}
        showMutedDot
      />
      <SummaryTile
        label="Awaiting review"
        value={awaitingReview.toLocaleString()}
        showWarningDot
      />
      <SummaryTile
        label="Failed"
        value={failed.toLocaleString()}
        tone={failed > 0 ? "destructive" : "default"}
        showDestructiveDot={failed > 0}
      />
    </div>
  );
}
