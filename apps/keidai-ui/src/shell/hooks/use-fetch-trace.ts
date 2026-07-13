import useSWR from "swr";
import { fetchTrace } from "../../torii/api/torii-client.js";

export const TRACE_KEY = "trace";

const swrOptions = { onError: () => undefined } as const;

export function useFetchTrace(traceId: string | null) {
  const { data, error, isLoading, mutate } = useSWR(
    traceId ? [TRACE_KEY, traceId] : null,
    () => fetchTrace(traceId!),
    swrOptions,
  );

  return { data, error, isLoading, refresh: mutate };
}
