import useSWR from "swr";
import { fetchToriiHealth } from "../../torii/api/gateway-client.js";
import {
  initialToriiHealth,
  pollIntervalMs,
  TORII_STATUS_KEY,
} from "./backend-health.js";

/** @deprecated Use TORII_STATUS_KEY */
export const GATEWAY_STATUS_KEY = TORII_STATUS_KEY;

export function useGatewayStatus() {
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
