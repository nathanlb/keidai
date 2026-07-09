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
import { Search, Workflow } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { RunReport } from "@keidai/shared";
import { useRuns } from "../../shell/hooks/use-runs.js";
import { RunDetailDrawer } from "./run-detail-drawer.js";
import { RunsSearchBar } from "./runs-search-bar.js";
import { RunsStatusChips } from "./runs-status-chips.js";
import { RunsSummaryTiles } from "./runs-summary-tiles.js";
import { RunsTableRow } from "./runs-table-row.js";
import { summarizeRunStats } from "./utils/count-run-statuses.js";
import {
  EMPTY_RUN_FILTERS,
  filterRuns,
  type RunFilters,
} from "./utils/filter-runs.js";
import type { RunStatusFilter } from "./utils/derive-run-display-status.js";

function RunsEmptyState() {
  return (
    <Card className="shadow-none">
      <CardContent className="flex flex-col items-center px-6 py-[60px] text-center">
        <span className="flex size-[52px] items-center justify-center rounded-[14px] bg-muted/55 text-muted-foreground">
          <Workflow className="size-[30px]" aria-hidden />
        </span>
        <div className="mt-4 text-base font-semibold">No runs yet</div>
        <p className="mt-1.5 max-w-[380px] text-[13px] leading-normal text-muted-foreground">
          Start the Shaiden harness to observe step sequence, tool calls, and
          termination outcome here.
        </p>
      </CardContent>
    </Card>
  );
}

function RunsNoMatchEmptyState({
  onClearFilters,
}: {
  onClearFilters: () => void;
}) {
  return (
    <Card className="shadow-none">
      <CardContent className="flex flex-col items-center px-6 py-12 text-center">
        <Search className="size-[18px] text-muted-foreground" aria-hidden />
        <div className="mt-3 text-sm font-semibold">No runs match these filters</div>
        <p className="mt-1 text-[12.5px] text-muted-foreground">
          Try a different status or search term.
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

export function RunVisibilityView() {
  const [filters, setFilters] = useState<RunFilters>(EMPTY_RUN_FILTERS);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [selectedRun, setSelectedRun] = useState<RunReport | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { runs, error, isLoading, suspendedRunIds, loadRun, refresh } =
    useRuns(true);

  useEffect(() => {
    if (!selectedRunId) {
      setSelectedRun(null);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const run = await loadRun(selectedRunId);
        if (!cancelled) {
          setSelectedRun(run);
        }
      } catch {
        if (!cancelled) {
          setSelectedRun(null);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [loadRun, selectedRunId, runs]);

  const stats = useMemo(
    () => summarizeRunStats(runs, suspendedRunIds),
    [runs, suspendedRunIds],
  );

  const filteredRuns = useMemo(
    () => filterRuns(runs, filters, suspendedRunIds),
    [filters, runs, suspendedRunIds],
  );

  const onOpenRun = useCallback((runId: string) => {
    setSelectedRunId(runId);
    setDrawerOpen(true);
  }, []);

  const onDrawerOpenChange = useCallback((open: boolean) => {
    setDrawerOpen(open);
    if (!open) {
      setSelectedRunId(null);
    }
  }, []);

  const onClearFilters = useCallback(() => {
    setFilters(EMPTY_RUN_FILTERS);
  }, []);

  const onStatusChange = useCallback((status: RunStatusFilter) => {
    setFilters((current) => ({ ...current, status }));
  }, []);

  const onRunUpdated = useCallback(() => {
    if (!selectedRunId) {
      return;
    }

    void (async () => {
      try {
        const run = await loadRun(selectedRunId);
        setSelectedRun(run);
        await refresh();
      } catch {
        setSelectedRun(null);
      }
    })();
  }, [loadRun, refresh, selectedRunId]);

  if (isLoading && runs.length === 0) {
    return <p className="text-sm text-muted-foreground">Loading runs…</p>;
  }

  if (error) {
    return (
      <p className="text-sm text-destructive">
        Could not load runs from the gateway.
      </p>
    );
  }

  if (runs.length === 0) {
    return <RunsEmptyState />;
  }

  const hasMatches = filteredRuns.length > 0;

  return (
    <div className="space-y-4">
      <RunsSummaryTiles
        runsToday={stats.runsToday}
        running={stats.running}
        awaitingReview={stats.awaitingReview}
        failed={stats.failed}
      />

      <RunsSearchBar
        query={filters.query}
        onQueryChange={(query) => setFilters((current) => ({ ...current, query }))}
      />

      <RunsStatusChips
        counts={stats.statusCounts}
        active={filters.status}
        onChange={onStatusChange}
      />

      {hasMatches ? (
        <Card className="overflow-hidden shadow-none">
          <CardContent className="p-0">
            <Table className="table-fixed">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="h-auto w-[28%] py-2.5 pl-[18px] text-xs font-medium">
                    Run
                  </TableHead>
                  <TableHead className="h-auto py-2.5 text-xs font-medium">
                    Started
                  </TableHead>
                  <TableHead className="h-auto py-2.5 text-xs font-medium">
                    Iterations
                  </TableHead>
                  <TableHead className="h-auto py-2.5 text-right text-xs font-medium">
                    Duration
                  </TableHead>
                  <TableHead className="h-auto py-2.5 text-xs font-medium">
                    Status
                  </TableHead>
                  <TableHead className="h-auto w-[16%] py-2.5 text-xs font-medium">
                    Agent
                  </TableHead>
                  <TableHead className="h-auto w-0 py-2.5 pr-[18px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRuns.map((run) => (
                  <RunsTableRow
                    key={run.id}
                    run={run}
                    suspendedRunIds={suspendedRunIds}
                    selected={selectedRunId === run.id}
                    onOpen={onOpenRun}
                  />
                ))}
              </TableBody>
            </Table>
            <div className="border-t border-border px-[18px] py-2.5 text-xs text-muted-foreground">
              Showing{" "}
              <span className="font-mono text-foreground">
                {filteredRuns.length}
              </span>{" "}
              of{" "}
              <span className="font-mono text-foreground">{runs.length}</span>{" "}
              runs
            </div>
          </CardContent>
        </Card>
      ) : (
        <RunsNoMatchEmptyState onClearFilters={onClearFilters} />
      )}

      <RunDetailDrawer
        run={selectedRun}
        open={drawerOpen}
        onOpenChange={onDrawerOpenChange}
        onRunUpdated={onRunUpdated}
      />
    </div>
  );
}
