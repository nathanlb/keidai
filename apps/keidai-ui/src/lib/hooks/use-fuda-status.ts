import useSWR from "swr";
import { fetchFudaHealth, getFudaDisplayAddress } from "../api/agents.js";
import type { ServiceHealth } from "../types/service-health.js";
import { pollIntervalMs } from "./backend-health.js";

export const FUDA_STATUS_KEY = "fuda-status";

const initialFudaHealth: ServiceHealth = {
  healthy: false,
  label: "Checking…",
  displayAddress: getFudaDisplayAddress(),
  version: "",
};

export function useFudaStatus() {
  const { data, mutate, isLoading } = useSWR(
    FUDA_STATUS_KEY,
    fetchFudaHealth,
    { refreshInterval: pollIntervalMs },
  );

  return {
    status: data ?? initialFudaHealth,
    refresh: mutate,
    isLoading,
  };
}
