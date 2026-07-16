import useSWR from "swr";
import { fetchRun } from "../../shaiden/api/shaiden-client.js";

export const RUN_KEY = "run";

const swrOptions = {
  onError: () => undefined,
  revalidateOnFocus: false,
  // Prefer SSE-mutated cache over a racing GET that can overwrite fresher steps.
  revalidateIfStale: false,
} as const;

export function useFetchRun(runId: string | null) {
  const { data, error, isLoading, mutate } = useSWR(
    runId ? [RUN_KEY, runId] : null,
    () => fetchRun(runId!),
    swrOptions,
  );

  return { data, error, isLoading, refresh: mutate };
}
