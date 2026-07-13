import useSWR from "swr";
import { fetchShaidenHealth } from "../../shaiden/api/shaiden-client.js";
import {
  initialShaidenHealth,
  pollIntervalMs,
  SHAIDEN_STATUS_KEY,
} from "./backend-health.js";

export { SHAIDEN_STATUS_KEY };

export function useShaidenStatus() {
  const { data, mutate, isLoading } = useSWR(
    SHAIDEN_STATUS_KEY,
    fetchShaidenHealth,
    { refreshInterval: pollIntervalMs },
  );

  return {
    status: data ?? initialShaidenHealth,
    refresh: mutate,
    isLoading,
  };
}
