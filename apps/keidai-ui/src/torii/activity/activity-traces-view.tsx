import {
  Button,
  Card,
  CardContent,
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@keidai/ui";
import type { PublicServerConfig } from "@keidai/shared/dto";
import type { TraceListItem, TraceStatsResponse } from "@keidai/shared";
import { Activity, Info, Search } from "lucide-react";
import { ActivityFilterBar } from "./activity-filter-bar.js";
import { ActivityOutcomeChips } from "./activity-outcome-chips.js";
import { ActivitySummaryTiles } from "./activity-summary-tiles.js";
import { ActivityTraceRow } from "./activity-trace-row.js";
import { TraceDetailDrawer } from "./trace-detail-drawer.js";
import type { OutcomeCounts } from "./utils/count-trace-outcomes.js";
import type { TraceFilters } from "./utils/filter-traces.js";
import type { OutcomeFilter } from "./utils/format-trace-outcome.js";
import { useMemo } from "react";

const PAGE_SIZE = 50;

function TailToggle({
  isLive,
  onToggle,
}: {
  isLive: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="inline-flex h-[30px] items-center gap-1.5 rounded-full border border-border bg-background px-3 font-mono text-[12.5px] text-foreground whitespace-nowrap hover:bg-muted/40"
    >
      <span
        className={`size-1.5 rounded-full ${isLive ? "bg-success" : "bg-muted-foreground"}`}
        aria-hidden
      />
      {isLive ? "live" : "paused"}
    </button>
  );
}

function ActivityIdleEmptyState() {
  return (
    <Card className="shadow-none">
      <CardContent className="flex flex-col items-center px-6 py-[60px] text-center">
        <span className="flex size-[52px] items-center justify-center rounded-[14px] bg-muted/55 text-muted-foreground">
          <Activity className="size-[30px]" aria-hidden />
        </span>
        <div className="mt-4 text-base font-semibold">No activity yet</div>
        <p className="mt-1.5 max-w-[380px] text-[13px] leading-normal text-muted-foreground">
          The gateway is idle. A <span className="font-mono">CallTrace</span>{" "}
          will appear here the moment an agent invokes a tool through Torii.
        </p>
        <span className="mt-4 rounded-md border border-border px-2.5 py-1.5 font-mono text-xs text-muted-foreground">
          waiting on tools/call …
        </span>
      </CardContent>
    </Card>
  );
}

function ActivityNoMatchEmptyState({
  onClearFilters,
}: {
  onClearFilters: () => void;
}) {
  return (
    <Card className="shadow-none">
      <CardContent className="flex flex-col items-center px-6 py-12 text-center">
        <Search className="size-[18px] text-muted-foreground" aria-hidden />
        <div className="mt-3 text-sm font-semibold">
          No traces match these filters
        </div>
        <p className="mt-1 text-[12.5px] text-muted-foreground">
          Try a different outcome, server, or search term.
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-3.5"
          onClick={onClearFilters}
        >
          Clear filters
        </Button>
      </CardContent>
    </Card>
  );
}

export interface ActivityTracesViewProps {
  stats: TraceStatsResponse;
  traces: TraceListItem[];
  bufferCount: number;
  filteredTraces: TraceListItem[];
  outcomeCounts: OutcomeCounts;
  filters: TraceFilters;
  serverOptions: readonly string[];
  pageIndex: number;
  isLive: boolean;
  selectedTrace: TraceListItem | null;
  selectedTraceServer?: PublicServerConfig;
  drawerOpen: boolean;
  onFiltersChange: (filters: TraceFilters) => void;
  onOutcomeChange: (outcome: OutcomeFilter) => void;
  onClearFilters: () => void;
  onToggleLive: () => void;
  onPageChange: (pageIndex: number) => void;
  onOpenTrace: (trace: TraceListItem) => void;
  onDrawerOpenChange: (open: boolean) => void;
  onLinkProvider?: (providerId: string, ownerId: string) => void;
}

export function ActivityTracesView({
  stats,
  traces,
  bufferCount,
  filteredTraces,
  outcomeCounts,
  filters,
  serverOptions,
  pageIndex,
  isLive,
  selectedTrace,
  selectedTraceServer,
  drawerOpen,
  onFiltersChange,
  onOutcomeChange,
  onClearFilters,
  onToggleLive,
  onPageChange,
  onOpenTrace,
  onDrawerOpenChange,
  onLinkProvider,
}: ActivityTracesViewProps) {
  const isIdle = traces.length === 0;
  const hasMatches = filteredTraces.length > 0;
  const pageStart = pageIndex * PAGE_SIZE;
  const pageTraces = filteredTraces.slice(pageStart, pageStart + PAGE_SIZE);
  const shownCount = pageTraces.length;
  const canGoNewer = pageIndex > 0;
  const canGoOlder = pageStart + PAGE_SIZE < filteredTraces.length;

  const infoCard = useMemo(
    () => (
      <div className="flex items-center justify-between gap-3 rounded-lg border border-border px-4 py-3 text-sm text-muted-foreground">
        <p className="leading-snug">
          Live tail of <span className="font-mono">CallTrace</span> events the
          gateway emits per <span className="font-mono">tools/call</span>. v0
          keeps the recent <span className="font-mono">~200</span> in a buffer.
        </p>
        <TailToggle isLive={isLive} onToggle={onToggleLive} />
      </div>
    ),
    [isLive, onToggleLive],
  );

  if (isIdle) {
    return (
      <div className="space-y-4">
        {infoCard}
        <ActivityIdleEmptyState />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {infoCard}

      <ActivitySummaryTiles stats={stats} />

      <ActivityFilterBar
        query={filters.query}
        server={filters.server}
        serverOptions={serverOptions}
        onQueryChange={(query) => onFiltersChange({ ...filters, query })}
        onServerChange={(server) => onFiltersChange({ ...filters, server })}
      />

      <ActivityOutcomeChips
        counts={outcomeCounts}
        active={filters.outcome}
        onChange={onOutcomeChange}
      />

      {hasMatches ? (
        <>
          <Card className="overflow-hidden shadow-none">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="h-auto w-0 p-0" />
                    <TableHead className="h-auto py-2.5 pl-3.5 text-xs font-medium">
                      Time
                    </TableHead>
                    <TableHead className="h-auto py-2.5 text-xs font-medium">
                      Outcome
                    </TableHead>
                    <TableHead className="h-auto py-2.5 text-xs font-medium">
                      Call
                    </TableHead>
                    <TableHead className="h-auto py-2.5 text-xs font-medium">
                      Principal
                    </TableHead>
                    <TableHead className="h-auto py-2.5 text-xs font-medium">
                      Policy
                    </TableHead>
                    <TableHead className="h-auto py-2.5 pr-[18px] text-right text-xs font-medium">
                      Duration
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pageTraces.map((trace) => (
                    <ActivityTraceRow
                      key={trace.traceId}
                      trace={trace}
                      onOpen={onOpenTrace}
                    />
                  ))}
                </TableBody>
              </Table>
              <div className="flex items-center justify-between border-t border-border px-[18px] py-2.5 text-xs text-muted-foreground">
                <span>
                  Showing{" "}
                  <span className="font-mono text-foreground">
                    {shownCount}
                  </span>{" "}
                  of{" "}
                  <span className="font-mono text-foreground">
                    {bufferCount}
                  </span>{" "}
                  traces in buffer
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={!canGoNewer}
                    onClick={() => onPageChange(pageIndex - 1)}
                  >
                    Newer
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={!canGoOlder}
                    onClick={() => onPageChange(pageIndex + 1)}
                  >
                    Older
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Info className="size-3.5 shrink-0" aria-hidden />
            Click any row to open the full trace — principal, policy decision,
            credential resolution &amp; backend timing.
          </p>
        </>
      ) : (
        <ActivityNoMatchEmptyState onClearFilters={onClearFilters} />
      )}

      <TraceDetailDrawer
        trace={selectedTrace}
        server={selectedTraceServer}
        open={drawerOpen}
        onOpenChange={onDrawerOpenChange}
        onLinkProvider={onLinkProvider}
      />
    </div>
  );
}
