import {
  RUN_SSE_EVENT,
  type RunListItem,
  type RunReport,
} from "@keidai/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import useSWR, { mutate as globalMutate } from "swr";
import { fetchRuns, getRunsEventsUrl } from "../api/gateway-client.js";
import { isRunSuspended } from "../../shaiden/runs/utils/derive-run-display-status.js";
import { RUN_KEY } from "./use-fetch-run.js";

export const RUNS_KEY = "runs-list";

const BUFFER_LIMIT = 50;

function mergeRun(current: RunListItem[], run: RunListItem): RunListItem[] {
  const without = current.filter((item) => item.id !== run.id);
  return [
    {
      id: run.id,
      startedAt: run.startedAt,
      assignee: run.assignee,
      goalPreview: run.goalPreview,
      status: run.status,
      outcome: run.outcome,
      stepCount: run.stepCount,
    },
    ...without,
  ].slice(0, BUFFER_LIMIT);
}

function toListItem(run: RunReport): RunListItem {
  return {
    id: run.id,
    startedAt: run.startedAt,
    assignee: run.assignee,
    goalPreview: run.goalPreview,
    status: run.status,
    outcome: run.outcome,
    stepCount: run.steps.length,
  };
}

function deriveSuspendedRunIds(runs: readonly RunReport[]): Set<string> {
  const ids = new Set<string>();
  for (const run of runs) {
    if (run.status === "running" && isRunSuspended(run.steps)) {
      ids.add(run.id);
    }
  }
  return ids;
}

function suspendedIdsFromList(
  runs: readonly RunListItem[],
  fullRuns: ReadonlyMap<string, RunReport>,
): Set<string> {
  const ids = new Set<string>();
  for (const run of runs) {
    const full = fullRuns.get(run.id);
    if (full && isRunSuspended(full.steps)) {
      ids.add(run.id);
    }
  }
  return ids;
}

function cacheRunReport(
  fullRuns: Map<string, RunReport>,
  run: RunReport,
): void {
  fullRuns.set(run.id, run);
  void globalMutate([RUN_KEY, run.id], run, { revalidate: false });
}

export function useRuns(isLive: boolean) {
  const [runs, setRuns] = useState<RunListItem[]>([]);
  const [suspendedRunIds, setSuspendedRunIds] = useState<Set<string>>(
    () => new Set(),
  );
  const eventSourceRef = useRef<EventSource | null>(null);
  const fullRunsRef = useRef<Map<string, RunReport>>(new Map());

  const { data, error, isLoading, mutate } = useSWR(
    RUNS_KEY,
    async () => fetchRuns({ limit: BUFFER_LIMIT }),
    { revalidateOnFocus: false },
  );

  useEffect(() => {
    if (!data) {
      return;
    }

    setRuns(data.runs);
    setSuspendedRunIds(
      suspendedIdsFromList(data.runs, fullRunsRef.current),
    );
  }, [data]);

  useEffect(() => {
    if (!isLive) {
      eventSourceRef.current?.close();
      eventSourceRef.current = null;
      return;
    }

    const eventSource = new EventSource(getRunsEventsUrl());
    eventSourceRef.current = eventSource;

    const handleRunUpdated = (event: MessageEvent<string>) => {
      const run = JSON.parse(event.data) as RunReport;
      cacheRunReport(fullRunsRef.current, run);
      setRuns((current) => mergeRun(current, toListItem(run)));
      setSuspendedRunIds(deriveSuspendedRunIds([...fullRunsRef.current.values()]));
    };

    eventSource.addEventListener(RUN_SSE_EVENT.runUpdated, handleRunUpdated);

    return () => {
      eventSource.removeEventListener(
        RUN_SSE_EVENT.runUpdated,
        handleRunUpdated,
      );
      eventSource.close();
      eventSourceRef.current = null;
    };
  }, [isLive]);

  const refresh = useCallback(async () => {
    const response = await mutate();
    if (response) {
      setRuns(response.runs);
      setSuspendedRunIds(
        suspendedIdsFromList(response.runs, fullRunsRef.current),
      );
    }
  }, [mutate]);

  return {
    runs,
    error,
    isLoading,
    suspendedRunIds,
    refresh,
  };
}
