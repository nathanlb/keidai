import useSWR from "swr";
import { fetchTraceStats } from "../api/gateway-client.js";

export const TRACE_STATS_KEY = "trace-stats";

const DEFAULT_WINDOW_MS = 900_000;

const swrOptions = { onError: () => undefined } as const;

export function useFetchTraceStats(windowMs = DEFAULT_WINDOW_MS) {
  const { data, error, isLoading, mutate } = useSWR(
    [TRACE_STATS_KEY, windowMs],
    () => fetchTraceStats(windowMs),
    swrOptions,
  );

  return { data, error, isLoading, refresh: mutate };
}
