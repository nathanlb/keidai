import type {
  ConfigAgentsResponse,
  ConfigOAuthProvidersResponse,
  ConfigServersResponse,
  OAuthConnectionsResponse,
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

export async function fetchOAuthProviders(): Promise<ConfigOAuthProvidersResponse> {
  return fetchJson<ConfigOAuthProvidersResponse>("/api/config/oauth-providers");
}

export async function fetchOAuthConnections(
  ownerId: string,
): Promise<OAuthConnectionsResponse> {
  const query = `?owner=${encodeURIComponent(ownerId)}`;
  return fetchJson<OAuthConnectionsResponse>(`/api/oauth/connections${query}`);
}
