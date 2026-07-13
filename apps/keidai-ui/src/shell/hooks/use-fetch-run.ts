import useSWR from "swr";
import { fetchRun } from "../api/gateway-client.js";

export const RUN_KEY = "run";

const swrOptions = { onError: () => undefined } as const;

export function useFetchRun(runId: string | null) {
  const { data, error, isLoading, mutate } = useSWR(
    runId ? [RUN_KEY, runId] : null,
    () => fetchRun(runId!),
    swrOptions,
  );

  return { data, error, isLoading, refresh: mutate };
}
