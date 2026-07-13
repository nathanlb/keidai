import type { TraceListItem } from "@keidai/shared";
import useSWR from "swr";
import { fetchTraces } from "../../torii/api/gateway-client.js";

export const LINKING_REQUIRED_TRACE_KEY = "linking-required-trace";

const swrOptions = { onError: () => undefined } as const;

async function fetchLatestLinkingRequiredTrace(
  ownerId: string,
): Promise<TraceListItem | null> {
  const response = await fetchTraces({
    outcome: "linking_required",
    limit: 20,
  });

  return (
    response.traces.find((trace) => trace.principal?.ownerId === ownerId) ??
    null
  );
}

export function useFetchLinkingRequiredTrace(ownerId: string) {
  const { data, error, isLoading, mutate } = useSWR(
    [LINKING_REQUIRED_TRACE_KEY, ownerId],
    () => fetchLatestLinkingRequiredTrace(ownerId),
    swrOptions,
  );

  return { trace: data ?? null, error, isLoading, refresh: mutate };
}
