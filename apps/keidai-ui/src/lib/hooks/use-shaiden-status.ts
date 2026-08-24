import useSWR from "swr";
import { fetchShaidenHealth } from "../api/runs.js";
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
