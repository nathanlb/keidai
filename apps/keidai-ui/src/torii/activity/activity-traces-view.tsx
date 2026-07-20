import { PageEmptyState } from "../../shell/components/page-content/page-empty-state.js";
import {
  Button,
  Card,
  CardContent,
  cn,
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@keidai/ui";
import { Activity, Info, Search } from "lucide-react";
import { useMemo } from "react";
import { TablePaginationFooter } from "../../shell/components/table-pagination/table-pagination-footer.js";
import { paginateItems } from "../../shell/components/table-pagination/paginate-items.js";
import { useActivityTracesPage } from "./context/use-activity-traces.js";
import { ActivityFilterBar } from "./activity-filter-bar.js";
import { ActivityOutcomeChips } from "./activity-outcome-chips.js";
import { ActivitySummaryTiles } from "./activity-summary-tiles.js";
import { ActivityTraceRow } from "./activity-trace-row.js";
import { TraceDetailDrawer } from "./trace-detail-drawer.js";

function TailToggle({
  isLive,
  onToggle,
}: {
  isLive: boolean;
  onToggle: () => void;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      onClick={onToggle}
      className="h-[30px] gap-1.5 rounded-full px-3 font-mono text-[12.5px] whitespace-nowrap"
    >
      <span
        className={cn(
          "size-1.5 rounded-full",
          isLive ? "bg-success" : "bg-muted-foreground",
        )}
        aria-hidden
      />
      {isLive ? "live" : "paused"}
    </Button>
  );
}

function ActivityIdleEmptyState() {
  return (
    <PageEmptyState
      icon={<Activity className="size-[30px]" aria-hidden />}
      title="No activity yet"
      description={
        <>
          The gateway is idle. A <span className="font-mono">CallTrace</span>{" "}
          will appear here the moment an agent invokes a tool through Torii.
        </>
      }
      footer={
        <span className="mt-4 rounded-md border border-border px-2.5 py-1.5 font-mono text-xs text-muted-foreground">
          waiting on tools/call …
        </span>
      }
    />
  );
}

function ActivityNoMatchEmptyState({
  onClearFilters,
}: {
  onClearFilters: () => void;
}) {
  return (
    <PageEmptyState
      icon={<Search className="size-[18px]" aria-hidden />}
      title="No traces match these filters"
      description="Try a different outcome, server, or search term."
      contentClassName="py-12"
      action={
        <Button type="button" variant="outline" size="sm" onClick={onClearFilters}>
          Clear filters
        </Button>
      }
    />
  );
}

export function ActivityTracesView() {
  const {
    stats,
    traces,
    bufferCount,
    filteredTraces,
    outcomeCounts,
    filters,
    serverOptions,
    pageIndex,
    isLive,
    setFilters,
    onOutcomeChange,
    onClearFilters,
    onToggleLive,
    onPageChange,
    onOpenTrace,
  } = useActivityTracesPage();

  const isIdle = traces.length === 0;
  const hasMatches = filteredTraces.length > 0;
  const {
    pageItems: pageTraces,
    shownCount,
    canGoNewer,
    canGoOlder,
  } = paginateItems(filteredTraces, pageIndex);

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
        onQueryChange={(query) => setFilters({ ...filters, query })}
        onServerChange={(server) => setFilters({ ...filters, server })}
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
              <TablePaginationFooter
                shownCount={shownCount}
                totalCount={bufferCount}
                totalLabel="traces in buffer"
                canGoNewer={canGoNewer}
                canGoOlder={canGoOlder}
                onPageChange={onPageChange}
                pageIndex={pageIndex}
              />
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

      <TraceDetailDrawer />
    </div>
  );
}
