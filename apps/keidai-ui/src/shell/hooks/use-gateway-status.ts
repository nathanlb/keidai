import useSWR from "swr";
import {
  fetchGatewayStatus,
  type GatewayStatus,
} from "../../torii/api/gateway-client.js";

export const GATEWAY_STATUS_KEY = "gateway-status";

const pollIntervalMs = 30_000;

const initialStatus: GatewayStatus = {
  healthy: false,
  label: "Checking gateway…",
  displayAddress: "",
  version: "",
};

export function useGatewayStatus() {
  const { data, mutate, isLoading } = useSWR(
    GATEWAY_STATUS_KEY,
    fetchGatewayStatus,
    { refreshInterval: pollIntervalMs },
  );

  return {
    status: data ?? initialStatus,
    refresh: mutate,
    isLoading,
  };
}
