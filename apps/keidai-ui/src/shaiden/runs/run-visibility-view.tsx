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
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useFetchRun } from "../../shell/hooks/use-fetch-run.js";
import { useRuns } from "../../shell/hooks/use-runs.js";
import { NEW_TASK_HREF, NEW_TASK_PARAM } from "../navigation.js";
import { TaskAuthoringDialog } from "../tasks/task-authoring-dialog.js";
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

const RUN_ID_PARAM = "run";

function RunsEmptyState() {
  return (
    <Card className="shadow-none">
      <CardContent className="flex flex-col items-center px-6 py-[60px] text-center">
        <span className="flex size-[52px] items-center justify-center rounded-[14px] bg-muted/55 text-muted-foreground">
          <Workflow className="size-[30px]" aria-hidden />
        </span>
        <div className="mt-4 text-base font-semibold">No runs yet</div>
        <p className="mt-1.5 max-w-[380px] text-[13px] leading-normal text-muted-foreground">
          Author a Task and run it to observe step sequence, tool calls, and
          termination outcome here.
        </p>
        <Button asChild type="button" className="mt-4">
          <Link to={NEW_TASK_HREF}>Configure a task</Link>
        </Button>
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
        <div className="mt-3 text-sm font-semibold">
          No runs match these filters
        </div>
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

function withRunsOverlays(
  content: ReactNode,
  overlays: { taskDialog: ReactNode; runDrawer: ReactNode },
) {
  return (
    <>
      {content}
      {overlays.taskDialog}
      {overlays.runDrawer}
    </>
  );
}

export function RunVisibilityView() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedRunId = searchParams.get(RUN_ID_PARAM);
  const newTaskOpen = searchParams.has(NEW_TASK_PARAM);
  const [filters, setFilters] = useState<RunFilters>(EMPTY_RUN_FILTERS);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(
    requestedRunId,
  );
  const [drawerOpen, setDrawerOpen] = useState(Boolean(requestedRunId));
  const { runs, error, isLoading, suspendedRunIds, refresh } = useRuns(true);
  const {
    data: fetchedRun,
    error: fetchRunError,
    isLoading: isFetchingRun,
    refresh: refreshRun,
  } = useFetchRun(selectedRunId);

  useEffect(() => {
    if (!requestedRunId) {
      return;
    }
    setSelectedRunId(requestedRunId);
    setDrawerOpen(true);
  }, [requestedRunId]);

  const selectedRun = useMemo(() => {
    if (!selectedRunId) {
      return null;
    }
    if (fetchedRun?.id === selectedRunId) {
      return fetchedRun;
    }
    return null;
  }, [fetchedRun, selectedRunId]);

  const stats = useMemo(
    () => summarizeRunStats(runs, suspendedRunIds),
    [runs, suspendedRunIds],
  );

  const filteredRuns = useMemo(
    () => filterRuns(runs, filters, suspendedRunIds),
    [filters, runs, suspendedRunIds],
  );

  const syncSearchParams = useCallback(
    (patch: { runId?: string | null; newTask?: boolean }) => {
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current);
          if (patch.runId !== undefined) {
            if (patch.runId) {
              next.set(RUN_ID_PARAM, patch.runId);
            } else {
              next.delete(RUN_ID_PARAM);
            }
          }
          if (patch.newTask !== undefined) {
            if (patch.newTask) {
              next.set(NEW_TASK_PARAM, "1");
            } else {
              next.delete(NEW_TASK_PARAM);
            }
          }
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const onOpenRun = useCallback(
    (runId: string) => {
      setSelectedRunId(runId);
      setDrawerOpen(true);
      syncSearchParams({ runId, newTask: false });
    },
    [syncSearchParams],
  );

  const onDrawerOpenChange = useCallback(
    (open: boolean) => {
      setDrawerOpen(open);
      if (!open) {
        setSelectedRunId(null);
        syncSearchParams({ runId: null });
      }
    },
    [syncSearchParams],
  );

  const onNewTaskOpenChange = useCallback(
    (open: boolean) => {
      if (open) {
        setSelectedRunId(null);
        setDrawerOpen(false);
        syncSearchParams({ runId: null, newTask: true });
        return;
      }
      syncSearchParams({ newTask: false });
    },
    [syncSearchParams],
  );

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
    void refreshRun();
    void refresh();
  }, [refresh, refreshRun, selectedRunId]);

  const overlays = {
    taskDialog: (
      <TaskAuthoringDialog
        open={newTaskOpen}
        onOpenChange={onNewTaskOpenChange}
      />
    ),
    runDrawer: (
      <RunDetailDrawer
        run={selectedRun}
        open={drawerOpen}
        onOpenChange={onDrawerOpenChange}
        onRunUpdated={onRunUpdated}
      />
    ),
  };

  if (isLoading && runs.length === 0 && !selectedRunId) {
    return withRunsOverlays(
      <p className="text-sm text-muted-foreground">Loading runs…</p>,
      overlays,
    );
  }

  if (error && runs.length === 0 && !selectedRunId) {
    return withRunsOverlays(
      <p className="text-sm text-destructive">
        Could not load runs from the service.
      </p>,
      overlays,
    );
  }

  if (runs.length === 0 && !selectedRunId) {
    return withRunsOverlays(<RunsEmptyState />, overlays);
  }

  const hasMatches = filteredRuns.length > 0;

  return withRunsOverlays(
    <div className="space-y-4">
      {runs.length > 0 ? (
        <>
          <RunsSummaryTiles
            runsToday={stats.runsToday}
            running={stats.running}
            awaitingReview={stats.awaitingReview}
            failed={stats.failed}
          />

          <RunsSearchBar
            query={filters.query}
            onQueryChange={(query) =>
              setFilters((current) => ({ ...current, query }))
            }
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
        </>
      ) : selectedRunId ? (
        fetchRunError ? (
          <Card className="shadow-none">
            <CardContent className="flex flex-col items-center px-6 py-12 text-center">
              <div className="text-sm font-semibold">Run not found</div>
              <p className="mt-1 text-[12.5px] text-muted-foreground">
                Could not load run{" "}
                <span className="font-mono text-foreground">{selectedRunId}</span>{" "}
                from the service.
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-3.5"
                onClick={() => onDrawerOpenChange(false)}
              >
                Dismiss
              </Button>
            </CardContent>
          </Card>
        ) : isFetchingRun || !selectedRun ? (
          <p className="text-sm text-muted-foreground">Loading run…</p>
        ) : null
      ) : null}
    </div>,
    overlays,
  );
}
