import useSWR from "swr";
import { fetchRuns } from "../../shaiden/api/shaiden-client.js";

export const SHAIDEN_STATUS_KEY = "shaiden-status";

const pollIntervalMs = 30_000;

export function useShaidenStatus() {
  const { data, isLoading } = useSWR(
    SHAIDEN_STATUS_KEY,
    async () => {
      await fetchRuns({ limit: 1 });
      return { available: true };
    },
    { refreshInterval: pollIntervalMs },
  );

  return {
    status: data ?? { available: false },
    isLoading,
  };
}
