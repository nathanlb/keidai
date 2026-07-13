import useSWR from "swr";
import { fetchToriiHealth } from "../../torii/api/torii-client.js";
import {
  initialToriiHealth,
  pollIntervalMs,
  TORII_STATUS_KEY,
} from "./backend-health.js";

export function useToriiStatus() {
  const { data, mutate, isLoading } = useSWR(
    TORII_STATUS_KEY,
    fetchToriiHealth,
    { refreshInterval: pollIntervalMs },
  );

  return {
    status: data ?? initialToriiHealth,
    refresh: mutate,
    isLoading,
  };
}
