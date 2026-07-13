import type { ServiceHealth } from "../types/service-health.js";
import {
  fetchToriiHealth,
  getToriiDisplayAddress,
} from "../../torii/api/torii-client.js";
import {
  fetchShaidenHealth,
  getShaidenDisplayAddress,
} from "../../shaiden/api/shaiden-client.js";

export interface BackendHealth {
  torii: ServiceHealth;
  shaiden: ServiceHealth;
}

export const TORII_STATUS_KEY = "torii-status";
export const SHAIDEN_STATUS_KEY = "shaiden-status";

const pollIntervalMs = 30_000;

const initialToriiHealth: ServiceHealth = {
  healthy: false,
  label: "Checking…",
  displayAddress: getToriiDisplayAddress(),
  version: "",
};

const initialShaidenHealth: ServiceHealth = {
  healthy: false,
  label: "Checking…",
  displayAddress: getShaidenDisplayAddress(),
  version: "",
};

export async function fetchBackendHealth(): Promise<BackendHealth> {
  const [torii, shaiden] = await Promise.all([
    fetchToriiHealth(),
    fetchShaidenHealth(),
  ]);

  return { torii, shaiden };
}

export {
  fetchToriiHealth,
  fetchShaidenHealth,
  initialToriiHealth,
  initialShaidenHealth,
  pollIntervalMs,
};
