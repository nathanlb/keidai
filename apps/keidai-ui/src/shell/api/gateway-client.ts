import type {
  ConfigAgentsResponse,
  ConfigOAuthProvidersResponse,
  ConfigServersResponse,
  ConnectionsResponse,
  OAuthConnectionsResponse,
  OAuthInitiateResponse,
  TraceListItem,
  TraceListQuery,
  TraceStatsResponse,
  TracesResponse,
} from "@keidai/shared";

const gatewayDisplayUrl =
  import.meta.env.VITE_GATEWAY_URL ?? "http://127.0.0.1:3100";

const gatewayVersion = import.meta.env.VITE_GATEWAY_VERSION ?? "0.0.0";

export interface GatewayStatus {
  healthy: boolean;
  label: string;
  displayAddress: string;
  version: string;
}

function parseDisplayAddress(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.hostname}:${parsed.port || (parsed.protocol === "https:" ? "443" : "80")}`;
  } catch {
    return url;
  }
}

export function getGatewayDisplayAddress(): string {
  return parseDisplayAddress(gatewayDisplayUrl);
}

export function getGatewayOrigin(): string {
  const configured = import.meta.env.VITE_GATEWAY_URL;
  if (configured) {
    return new URL(configured).origin;
  }

  if (typeof window !== "undefined") {
    return window.location.origin;
  }

  return new URL(gatewayDisplayUrl).origin;
}

export function getGatewayVersion(): string {
  return gatewayVersion;
}

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Gateway request failed: ${response.status}`);
  }
  return (await response.json()) as T;
}

export async function fetchGatewayStatus(): Promise<GatewayStatus> {
  const displayAddress = getGatewayDisplayAddress();
  const version = getGatewayVersion();

  try {
    await fetchJson<ConfigServersResponse>("/api/config/servers");
    return {
      healthy: true,
      label: "Gateway healthy",
      displayAddress,
      version,
    };
  } catch {
    return {
      healthy: false,
      label: "Gateway unreachable",
      displayAddress,
      version,
    };
  }
}

export async function fetchAgents(): Promise<ConfigAgentsResponse> {
  return fetchJson<ConfigAgentsResponse>("/api/config/agents");
}

export async function fetchServers(): Promise<ConfigServersResponse> {
  return fetchJson<ConfigServersResponse>("/api/config/servers");
}

export async function fetchConnections(): Promise<ConnectionsResponse> {
  return fetchJson<ConnectionsResponse>("/api/connections");
}

export async function reconnectAllConnections(): Promise<void> {
  const response = await fetch("/api/connections/reconnect", { method: "POST" });
  if (!response.ok) {
    throw new Error(`Reconnect all failed: ${response.status}`);
  }
}

export async function reconnectConnection(serverName: string): Promise<void> {
  const response = await fetch(
    `/api/connections/${encodeURIComponent(serverName)}/reconnect`,
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
