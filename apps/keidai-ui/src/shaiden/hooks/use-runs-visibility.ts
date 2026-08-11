import {
  RUN_SSE_EVENT,
  type RunListItem,
  type RunReport,
} from "@keidai/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import useSWR, { mutate as globalMutate } from "swr";
import { getRunsEventsUrl } from "../api/shaiden-client.js";
import {
  fetchRunsVisibility,
  type RunAssigneeDisplay,
  type RunVisibilityListItem,
} from "../api/runs-visibility-client.js";
import { isRunSuspended } from "../runs/utils/derive-run-display-status.js";
import { mergeRunListItem } from "../runs/utils/merge-run-list.js";
import { LIST_BUFFER_LIMIT } from "../../shell/constants/list-limits.js";
import { RUN_KEY } from "../../shell/hooks/use-fetch-run.js";

export const RUNS_VISIBILITY_KEY = "runs-visibility";

function toListItem(run: RunReport): RunListItem {
  return {
    id: run.id,
    taskId: run.taskId,
    startedAt: run.startedAt,
    assignee: run.assignee,
    goalPreview: run.goalPreview,
    status: run.status,
    outcome: run.outcome,
    stepCount: run.steps.length,
  };
}

function toVisibilityListItem(
  run: RunListItem,
  agentsById: Record<string, RunAssigneeDisplay>,
): RunVisibilityListItem {
  return {
    ...run,
    assigneeDisplay: agentsById[run.assignee] ?? null,
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

export function useRunsVisibility(isLive: boolean) {
  const [runs, setRuns] = useState<RunVisibilityListItem[]>([]);
  const [agentsById, setAgentsById] = useState<
    Record<string, RunAssigneeDisplay>
  >({});
  const [suspendedRunIds, setSuspendedRunIds] = useState<Set<string>>(
    () => new Set(),
  );
  const eventSourceRef = useRef<EventSource | null>(null);
  const fullRunsRef = useRef<Map<string, RunReport>>(new Map());
  const agentsByIdRef = useRef<Record<string, RunAssigneeDisplay>>({});

  const { data, error, isLoading, mutate } = useSWR(
    RUNS_VISIBILITY_KEY,
    async () => fetchRunsVisibility({ limit: LIST_BUFFER_LIMIT }),
    { revalidateOnFocus: false },
  );

  useEffect(() => {
    if (!data) {
      return;
    }

    agentsByIdRef.current = data.agentsById;
    setAgentsById(data.agentsById);
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
      const listItem = toListItem(run);
      const visibilityItem = toVisibilityListItem(
        listItem,
        agentsByIdRef.current,
      );
      setRuns((current) => mergeRunListItem(current, visibilityItem));
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
      agentsByIdRef.current = response.agentsById;
      setAgentsById(response.agentsById);
      setRuns(response.runs);
      setSuspendedRunIds(
        suspendedIdsFromList(response.runs, fullRunsRef.current),
      );
    }
  }, [mutate]);

  const resolveAssigneeDisplay = useCallback(
    (assigneeId: string): RunAssigneeDisplay | null =>
      agentsById[assigneeId] ?? null,
    [agentsById],
  );

  return {
    runs,
    agentsById,
    resolveAssigneeDisplay,
    error,
    isLoading,
    suspendedRunIds,
    refresh,
  };
}
