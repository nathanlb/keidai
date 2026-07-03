import { useCallback, useEffect, useMemo, useState } from "react";
import type { TraceListItem } from "@keidai/shared";
import { useActivityTraces } from "../../shell/hooks/use-activity-traces.js";
import { useFetchServers } from "../../shell/hooks/use-fetch-servers.js";
import { useFetchTraceStats } from "../../shell/hooks/use-fetch-trace-stats.js";
import { ActivityTracesView } from "../activity/activity-traces-view.js";
import { countTraceOutcomes } from "../activity/utils/count-trace-outcomes.js";
import {
  EMPTY_TRACE_FILTERS,
  filterTraces,
  type TraceFilters,
} from "../activity/utils/filter-traces.js";
import type { OutcomeFilter } from "../activity/utils/format-trace-outcome.js";

export function ActivityTracesPage() {
  const [isLive, setIsLive] = useState(true);
  const [filters, setFilters] = useState<TraceFilters>(EMPTY_TRACE_FILTERS);
  const [pageIndex, setPageIndex] = useState(0);
  const [selectedTrace, setSelectedTrace] = useState<TraceListItem | null>(
    null,
  );
  const [drawerOpen, setDrawerOpen] = useState(false);

  const {
    data: statsData,
    error: statsError,
    isLoading: statsLoading,
  } = useFetchTraceStats();

  const {
    data: serversData,
    error: serversError,
    isLoading: serversLoading,
  } = useFetchServers();

  const {
    traces,
    bufferCount,
    error: tracesError,
    isLoading: tracesLoading,
  } = useActivityTraces(isLive);

  const serverOptions = useMemo(() => {
    const names = new Set<string>();
    for (const server of serversData?.servers ?? []) {
      names.add(server.name);
    }
    for (const trace of traces) {
      names.add(trace.server);
    }
    return [...names].sort((left, right) => left.localeCompare(right));
  }, [serversData?.servers, traces]);

  const outcomeCounts = useMemo(() => countTraceOutcomes(traces), [traces]);

  const filteredTraces = useMemo(
    () => filterTraces(traces, filters),
    [filters, traces],
  );

  useEffect(() => {
    setPageIndex(0);
  }, [filters]);

  const handleOutcomeChange = useCallback((outcome: OutcomeFilter) => {
    setFilters((current) => ({ ...current, outcome }));
  }, []);

  const handleClearFilters = useCallback(() => {
    setFilters(EMPTY_TRACE_FILTERS);
  }, []);

  const handleOpenTrace = useCallback((trace: TraceListItem) => {
    setSelectedTrace(trace);
    setDrawerOpen(true);
  }, []);

  const isLoading =
    (statsLoading && !statsData) ||
    (tracesLoading && traces.length === 0) ||
    (serversLoading && !serversData);

  const error = statsError ?? tracesError ?? serversError;

  if (isLoading) {
    return (
      <p className="text-sm text-muted-foreground">Loading activity…</p>
    );
  }

  if (error || !statsData) {
    return (
      <p className="text-sm text-destructive">
        Could not load activity from the gateway.
      </p>
    );
  }

  return (
    <ActivityTracesView
      stats={statsData}
      traces={traces}
      bufferCount={bufferCount}
      filteredTraces={filteredTraces}
      outcomeCounts={outcomeCounts}
      filters={filters}
      serverOptions={serverOptions}
      pageIndex={pageIndex}
      isLive={isLive}
      selectedTrace={selectedTrace}
      drawerOpen={drawerOpen}
      onFiltersChange={setFilters}
      onOutcomeChange={handleOutcomeChange}
      onClearFilters={handleClearFilters}
      onToggleLive={() => setIsLive((current) => !current)}
      onPageChange={setPageIndex}
      onOpenTrace={handleOpenTrace}
      onDrawerOpenChange={setDrawerOpen}
    />
  );
}
