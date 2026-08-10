import type { ServiceHealth } from "../../shell/types/service-health.js";
import { resolveBackendDisplayAddress } from "../../shell/utils/resolve-backend-display-address.js";

export interface FudaHealthResponse {
  ok: boolean;
  version: string;
}

/** Identity + registry record. Owner and slug are fixed at registration. */
export interface ManagementAgent {
  id: string;
  slug: string;
  name: string;
  ownerId: string;
  /** Opaque group strings; Torii fails closed on groups it does not define. */
  groups: string[];
  /** Content of the current persona version. */
  persona: string;
  currentPersonaVersion: number;
  createdAt: string;
  updatedAt: string;
}

export interface PersonaVersion {
  agentId: string;
  version: number;
  content: string;
  createdAt: string;
}

export interface Bearer {
  bearerId: string;
  displayName: string;
}

export interface Grant {
  bearerId: string;
  agentId: string;
}

export interface CreateBearerRequest {
  bearerId: string;
  displayName: string;
}

export interface UpdateBearerRequest {
  displayName: string;
}

export interface CreateAgentRequest {
  slug: string;
  name: string;
  ownerId: string;
  groups: string[];
  persona: string;
}

export interface UpdateAgentRequest {
  name?: string;
  groups?: string[];
  /** Appends a new persona version; never mutates existing content. */
  persona?: string;
}

/** Display-only backend address for the health footer (API calls are same-origin `/api/*` via the BFF). */
export function getFudaDisplayAddress(): string {
  return resolveBackendDisplayAddress(
    "VITE_FUDA_URL",
    import.meta.env.VITE_FUDA_URL,
  );
}

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(path);
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(body?.error ?? `Fuda request failed: ${response.status}`);
  }
  return (await response.json()) as T;
}

async function fetchJsonWithBody<T>(
  path: string,
  init: RequestInit,
): Promise<T> {
  const response = await fetch(path, init);
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(body?.error ?? `Fuda request failed: ${response.status}`);
  }
  return (await response.json()) as T;
}

async function sendNoContent(path: string, init: RequestInit): Promise<void> {
  const response = await fetch(path, init);
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(body?.error ?? `Fuda request failed: ${response.status}`);
  }
}

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

export async function fetchBearer(
  bearerId: string,
): Promise<{ bearer: Bearer; grants: Grant[] }> {
  return fetchJson(`/api/bearers/${encodeURIComponent(bearerId)}`);
}

export async function createBearer(
  bearer: CreateBearerRequest,
): Promise<{ bearer: Bearer }> {
  return fetchJsonWithBody("/api/bearers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(bearer),
  });
}

export async function updateBearer(
  bearerId: string,
  update: UpdateBearerRequest,
): Promise<{ bearer: Bearer }> {
  return fetchJsonWithBody(`/api/bearers/${encodeURIComponent(bearerId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(update),
  });
}

export async function deleteBearer(bearerId: string): Promise<void> {
  return sendNoContent(`/api/bearers/${encodeURIComponent(bearerId)}`, {
    method: "DELETE",
  });
}

export async function fetchAgentGrants(
  agentId: string,
): Promise<{ grants: Grant[] }> {
  return fetchJson(`/api/agents/${encodeURIComponent(agentId)}/grants`);
}

export async function grantBearer(
  bearerId: string,
  agentId: string,
): Promise<{ grant: Grant }> {
  return fetchJsonWithBody(
    `/api/bearers/${encodeURIComponent(bearerId)}/grants`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agentId }),
    },
  );
}

export async function revokeBearerGrant(
  bearerId: string,
  agentId: string,
): Promise<void> {
  return sendNoContent(
    `/api/bearers/${encodeURIComponent(bearerId)}/grants/${encodeURIComponent(agentId)}`,
    { method: "DELETE" },
  );
}

export async function fetchFudaHealth(): Promise<ServiceHealth> {
  const displayAddress = getFudaDisplayAddress();

  try {
    const response = await fetch("/api/fuda/health");
    if (!response.ok) {
      throw new Error(`Fuda health request failed: ${response.status}`);
    }

    const health = (await response.json()) as FudaHealthResponse;
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
