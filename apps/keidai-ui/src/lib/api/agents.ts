import type { ServiceHealth } from "../types/service-health.js";
import { resolveBackendDisplayAddress } from "../utils/resolve-backend-display-address.js";
import type {
  Bearer,
  CreateAgentRequest,
  Grant,
  ManagementAgent,
  PersonaVersion,
  UpdateAgentRequest,
} from "../types/agents.js";
import {
  fetchJson,
  fetchJsonWithBody,
  sendNoContent,
} from "./fetch-json.js";

export type {
  Bearer,
  CreateAgentRequest,
  Grant,
  ManagementAgent,
  PersonaVersion,
  UpdateAgentRequest,
};

interface AgentsHealthResponse {
  ok: boolean;
  version: string;
}

/** Display-only backend address for the health footer (API calls are same-origin `/api/*` via the BFF). */
export function getAgentsRegistryDisplayAddress(): string {
  return resolveBackendDisplayAddress(
    "VITE_FUDA_URL",
    import.meta.env.VITE_FUDA_URL,
  );
}

/** @deprecated Use getAgentsRegistryDisplayAddress */
export const getFudaDisplayAddress = getAgentsRegistryDisplayAddress;

export async function fetchAgents(): Promise<{ agents: ManagementAgent[] }> {
  return fetchJson("/api/agents");
}

export async function fetchAgent(
  agentId: string,
): Promise<{ agent: ManagementAgent }> {
  return fetchJson(`/api/agents/${encodeURIComponent(agentId)}`);
}

export async function createAgent(
  agent: CreateAgentRequest,
): Promise<{ agent: ManagementAgent }> {
  return fetchJsonWithBody("/api/agents", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(agent),
  });
}

export async function updateAgent(
  agentId: string,
  update: UpdateAgentRequest,
): Promise<{ agent: ManagementAgent }> {
  return fetchJsonWithBody(`/api/agents/${encodeURIComponent(agentId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(update),
  });
}

export async function deleteAgent(agentId: string): Promise<void> {
  return sendNoContent(`/api/agents/${encodeURIComponent(agentId)}`, {
    method: "DELETE",
  });
}

export async function fetchPersonaVersions(
  agentId: string,
): Promise<{ personas: PersonaVersion[] }> {
  return fetchJson(`/api/agents/${encodeURIComponent(agentId)}/personas`);
}

export async function checkSlugAvailability(
  slug: string,
): Promise<{ available: boolean }> {
  return fetchJson(
    `/api/agents/slugs/${encodeURIComponent(slug)}/availability`,
  );
}

export async function fetchBearers(): Promise<{ bearers: Bearer[] }> {
  return fetchJson("/api/bearers");
}

export async function fetchAgentGrants(
  agentId: string,
): Promise<{ grants: Grant[] }> {
  return fetchJson(`/api/agents/${encodeURIComponent(agentId)}/grants`);
}

export async function fetchAgentsRegistryHealth(): Promise<ServiceHealth> {
  const displayAddress = getAgentsRegistryDisplayAddress();

  try {
    const response = await fetch("/api/fuda/health");
    if (!response.ok) {
      throw new Error(`Health request failed: ${response.status}`);
    }

    const health = (await response.json()) as AgentsHealthResponse;
    return {
      healthy: health.ok,
      label: health.ok ? "Healthy" : "Degraded",
      displayAddress,
      version: health.version,
    };
  } catch {
    return {
      healthy: false,
      label: "Unreachable",
      displayAddress,
      version: "",
    };
  }
}

/** @deprecated Use fetchAgentsRegistryHealth */
export const fetchFudaHealth = fetchAgentsRegistryHealth;
