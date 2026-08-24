import {
  Badge,
  Card,
  CardContent,
} from "@keidai/ui";
import type { ConnectionSummaryCounts } from "./utils/build-server-summaries.js";

function SummaryTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "default" | "success" | "warning" | "destructive";
}) {
  const valueClass =
    tone === "success"
      ? "text-success"
      : tone === "warning"
        ? "text-warning"
        : tone === "destructive"
          ? "text-destructive"
          : "text-foreground";

  return (
    <Card className="shadow-none">
      <CardContent className="px-4 py-3.5">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </div>
        <div className={`mt-1 text-2xl font-semibold tabular-nums ${valueClass}`}>
          {value}
        </div>
      </CardContent>
    </Card>
  );
}

export function ConnectionsSummaryTiles({
  counts,
}: {
  counts: ConnectionSummaryCounts;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <SummaryTile label="Total servers" value={counts.total} tone="default" />
      <SummaryTile label="Connected" value={counts.connected} tone="success" />
      <SummaryTile
        label="Connecting"
        value={counts.connecting}
        tone="warning"
      />
      <SummaryTile label="Failed" value={counts.failed} tone="destructive" />
    </div>
  );
}

export function CredentialStrategyBadge({
  strategy,
}: {
  strategy: "user_oauth" | "service_key" | "none";
}) {
  return (
    <Badge variant="secondary" className="w-fit font-mono text-[11px] font-medium">
      {strategy}
    </Badge>
  );
}
