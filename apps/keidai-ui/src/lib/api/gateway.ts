import type {
  ApprovalRecordStatus,
  ApprovalRecordView,
  CatalogConnectorsResponse,
  ConfigGroupsResponse,
  ConfigOAuthProvidersResponse,
  ConfigServersResponse,
  ConnectionsResponse,
  ConnectorResponse,
  ConnectorsResponse,
  CreateConnectorRequest,
  CreateGroupRequest,
  GroupResponse,
  GroupsResponse,
  GroupView,
  InstallCatalogConnectorRequest,
  OAuthConnectionsResponse,
  OAuthInitiateResponse,
  PublicConnector,
  PublicGroupDefinition,
  ServerToolsResponse,
  TraceListItem,
  TraceListQuery,
  TraceStatsResponse,
  TracesResponse,
  UpdateConnectorRequest,
  UpdateGroupRequest,
} from "@keidai/shared";

import type { ServiceHealth } from "../types/service-health.js";
import { resolveBackendDisplayAddress } from "../utils/resolve-backend-display-address.js";
import {
  fetchJson,
  fetchJsonWithBody,
  readErrorMessage,
  sendNoContent,
} from "./fetch-json.js";

interface GatewayHealthResponse {
  ok: boolean;
  version: string;
}

/**
 * Display-only backend address for the health footer.
 * Browser API calls are same-origin `/api/*` through the BFF — never this URL.
 */
export function getGatewayDisplayAddress(): string {
  return resolveBackendDisplayAddress(
    "VITE_TORII_URL",
    import.meta.env.VITE_TORII_URL,
  );
}

/** @deprecated Use getGatewayDisplayAddress */
export const getToriiDisplayAddress = getGatewayDisplayAddress;

/**
 * Public operator-edge origin (Vite/BFF), used for OAuth callback URLs and
 * postMessage origin checks. Not the gateway's internal listen address.
 */
export function getOperatorEdgeOrigin(): string {
  if (typeof window !== "undefined") {
    return window.location.origin;
  }

  return "http://localhost:3000";
}

/** @deprecated Use getOperatorEdgeOrigin */
export const getToriiOrigin = getOperatorEdgeOrigin;

export async function fetchGatewayHealth(): Promise<ServiceHealth> {
  const displayAddress = getGatewayDisplayAddress();

  try {
    const health = await fetchJson<GatewayHealthResponse>("/api/health");
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

/** @deprecated Use fetchGatewayHealth */
export const fetchToriiHealth = fetchGatewayHealth;

/** @deprecated Use fetchGatewayHealth */
export const fetchGatewayStatus = fetchGatewayHealth;

export type GatewayGroupDefinition = PublicGroupDefinition;

/** @deprecated Use GatewayGroupDefinition */
export type ToriiGroupDefinition = GatewayGroupDefinition;

export type ConfigKnownGroupsResponse = ConfigGroupsResponse;

/** @deprecated Use ConfigKnownGroupsResponse */
export type ToriiGroupsResponse = ConfigKnownGroupsResponse;

/**
 * Soft join for group-authoring UX. Missing/unreachable endpoint resolves to
 * an empty known-group set rather than throwing — every group then renders as
 * "unknown", which is the correct fail-closed default for authoring.
 */
export async function fetchConfigKnownGroups(): Promise<ConfigKnownGroupsResponse> {
  try {
    return await fetchJson<ConfigKnownGroupsResponse>("/api/config/groups");
  } catch {
    return { groups: [] };
  }
}

/** @deprecated Use fetchConfigKnownGroups */
export const fetchToriiGroups = fetchConfigKnownGroups;

export async function fetchGroups(): Promise<GroupsResponse> {
  return fetchJson<GroupsResponse>("/api/groups");
}

export async function fetchGroup(id: string): Promise<GroupView> {
  const response = await fetchJson<GroupResponse>(
    `/api/groups/${encodeURIComponent(id)}`,
  );
  return response.group;
}

export async function createGroup(
  body: CreateGroupRequest,
): Promise<GroupView> {
  const response = await fetchJsonWithBody<GroupResponse>("/api/groups", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return response.group;
}

export async function updateGroup(
  id: string,
  body: UpdateGroupRequest,
): Promise<GroupView> {
  const response = await fetchJsonWithBody<GroupResponse>(
    `/api/groups/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  return response.group;
}

export async function deleteGroup(id: string): Promise<void> {
  const response = await fetch(`/api/groups/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    throw new Error(
      await readErrorMessage(
        response,
        `Delete group failed: ${response.status}`,
      ),
    );
  }
}

export async function fetchServers(): Promise<ConfigServersResponse> {
  return fetchJson<ConfigServersResponse>("/api/config/servers");
}

export async function fetchConnectors(): Promise<ConnectorsResponse> {
  return fetchJson<ConnectorsResponse>("/api/connectors");
}

export async function fetchConnectorCatalog(): Promise<CatalogConnectorsResponse> {
  return fetchJson<CatalogConnectorsResponse>("/api/catalog/connectors");
}

export async function createConnector(
  body: CreateConnectorRequest,
): Promise<PublicConnector> {
  const response = await fetchJsonWithBody<ConnectorResponse>(
    "/api/connectors",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  return response.connector;
}

export async function installCatalogConnector(
  body: InstallCatalogConnectorRequest,
): Promise<PublicConnector> {
  const response = await fetchJsonWithBody<ConnectorResponse>(
    "/api/connectors/from-catalog",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  return response.connector;
}

export async function updateConnector(
  slug: string,
  body: UpdateConnectorRequest,
): Promise<PublicConnector> {
  const response = await fetchJsonWithBody<ConnectorResponse>(
    `/api/connectors/${encodeURIComponent(slug)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  return response.connector;
}

export async function deleteConnector(slug: string): Promise<void> {
  await sendNoContent(`/api/connectors/${encodeURIComponent(slug)}`, {
    method: "DELETE",
  });
}

export async function fetchConnections(): Promise<ConnectionsResponse> {
  return fetchJson<ConnectionsResponse>("/api/connections");
}

export async function fetchServerTools(
  serverName: string,
): Promise<ServerToolsResponse> {
  return fetchJson(
    `/api/connections/${encodeURIComponent(serverName)}/tools`,
  );
}

export async function reconnectAllConnections(ownerId: string): Promise<void> {
  const query = `?owner=${encodeURIComponent(ownerId)}`;
  const response = await fetch(`/api/connections/reconnect${query}`, {
    method: "POST",
  });
  if (!response.ok) {
    throw new Error(`Reconnect all failed: ${response.status}`);
  }
}

export async function reconnectConnection(
  serverName: string,
  ownerId: string,
): Promise<void> {
  const query = `?owner=${encodeURIComponent(ownerId)}`;
  const response = await fetch(
    `/api/connections/${encodeURIComponent(serverName)}/reconnect${query}`,
    { method: "POST" },
  );
  if (!response.ok) {
    throw new Error(`Reconnect failed: ${response.status}`);
  }
}

export async function fetchOAuthProviders(): Promise<ConfigOAuthProvidersResponse> {
  return fetchJson<ConfigOAuthProvidersResponse>("/api/config/oauth-providers");
}

export async function fetchOAuthConnections(
  ownerId: string,
): Promise<OAuthConnectionsResponse> {
  const query = `?owner=${encodeURIComponent(ownerId)}`;
  return fetchJson<OAuthConnectionsResponse>(`/api/oauth/connections${query}`);
}

function buildTraceQuery(query: TraceListQuery = {}): string {
  const params = new URLSearchParams();
  if (query.limit !== undefined) {
    params.set("limit", String(query.limit));
  }
  if (query.cursor) {
    params.set("cursor", query.cursor);
  }
  if (query.outcome) {
    params.set("outcome", query.outcome);
  }
  if (query.server) {
    params.set("server", query.server);
  }
  if (query.q) {
    params.set("q", query.q);
  }
  const serialized = params.toString();
  return serialized ? `?${serialized}` : "";
}

export async function fetchTraces(
  query: TraceListQuery = {},
): Promise<TracesResponse> {
  return fetchJson<TracesResponse>(`/api/traces${buildTraceQuery(query)}`);
}

export async function fetchTraceStats(
  windowMs?: number,
): Promise<TraceStatsResponse> {
  const query =
    windowMs !== undefined ? `?windowMs=${encodeURIComponent(windowMs)}` : "";
  return fetchJson<TraceStatsResponse>(`/api/traces/stats${query}`);
}

export async function fetchTrace(traceId: string): Promise<TraceListItem> {
  return fetchJson<TraceListItem>(
    `/api/traces/${encodeURIComponent(traceId)}`,
  );
}

export async function fetchApprovals(
  query: { status?: ApprovalRecordStatus; limit?: number } = {},
): Promise<ApprovalRecordView[]> {
  const params = new URLSearchParams();
  if (query.status) {
    params.set("status", query.status);
  }
  if (query.limit !== undefined) {
    params.set("limit", String(query.limit));
  }
  const serialized = params.toString();
  return fetchJson<ApprovalRecordView[]>(
    `/api/approvals${serialized ? `?${serialized}` : ""}`,
  );
}

export async function approveApproval(approvalId: string): Promise<void> {
  const response = await fetch(
    `/api/approvals/${encodeURIComponent(approvalId)}/approve`,
    { method: "POST" },
  );
  if (!response.ok) {
    throw new Error(`Approval failed: ${response.status}`);
  }
}

export async function rejectApproval(
  approvalId: string,
  reason?: string,
): Promise<void> {
  const response = await fetch(
    `/api/approvals/${encodeURIComponent(approvalId)}/reject`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(reason ? { reason } : {}),
    },
  );
  if (!response.ok) {
    throw new Error(`Rejection failed: ${response.status}`);
  }
}

export async function cancelApproval(approvalId: string): Promise<void> {
  const response = await fetch(
    `/api/approvals/${encodeURIComponent(approvalId)}/cancel`,
    { method: "POST" },
  );
  if (!response.ok) {
    throw new Error(`Cancel failed: ${response.status}`);
  }
}

export async function initiateOAuthLink(
  provider: string,
  ownerId: string,
): Promise<OAuthInitiateResponse> {
  const query = `?owner=${encodeURIComponent(ownerId)}`;
  const response = await fetch(
    `/api/oauth/initiate/${encodeURIComponent(provider)}${query}`,
    {
      method: "POST",
      headers: {
        "X-Torii-UI-Origin": window.location.origin,
      },
    },
  );

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(
      body?.error ?? `OAuth initiate failed: ${response.status}`,
    );
  }

  return (await response.json()) as OAuthInitiateResponse;
}

export async function unlinkOAuthConnection(
  provider: string,
  ownerId: string,
): Promise<void> {
  const query = `?owner=${encodeURIComponent(ownerId)}`;
  await sendNoContent(
    `/api/oauth/connections/${encodeURIComponent(provider)}${query}`,
    { method: "DELETE" },
  );
}
