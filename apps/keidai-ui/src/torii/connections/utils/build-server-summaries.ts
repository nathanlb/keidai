import type {
  ConnectionState,
  ConnectionStatus,
  OAuthConnectionStatus,
  PublicOAuthProviderConfig,
  PublicServerConfig,
} from "@keidai/shared";
import { formatCredentialSubStatus } from "./format-credential-substatus.js";
import { formatPolicySummary } from "./format-policy-summary.js";
import { formatPolicyTooltip } from "./format-policy-tooltip.js";

export type ServerRowAction = "link" | "none";

export interface ConnectionSummaryCounts {
  total: number;
  connected: number;
  connecting: number;
  failed: number;
}

export interface ServerConnectionSummary {
  name: string;
  endpoint: string;
  credentialStrategy: PublicServerConfig["credential"]["strategy"];
  credentialSubStatus: { label: string; warning: boolean };
  policySummary: string;
  policyAllowTooltip?: string;
  toolCount: number | null;
  state: ConnectionState;
  error?: string;
  rowAction: ServerRowAction;
  linkProviderId?: string;
}

function deriveRowAction(
  server: PublicServerConfig,
  _state: ConnectionState,
  oauthConnection: OAuthConnectionStatus | undefined,
): Pick<ServerConnectionSummary, "rowAction" | "linkProviderId"> {
  if (server.credential.strategy === "user_oauth") {
    const needsLink =
      !oauthConnection ||
      oauthConnection.status === "not_linked" ||
      oauthConnection.status === "expired";
    if (needsLink) {
      return {
        rowAction: "link",
        linkProviderId: server.credential.provider,
      };
    }
  }

  return { rowAction: "none" };
}

export function summarizeConnectionCounts(
  summaries: readonly ServerConnectionSummary[],
): ConnectionSummaryCounts {
  return summaries.reduce<ConnectionSummaryCounts>(
    (counts, summary) => {
      counts.total += 1;
      switch (summary.state) {
        case "connected":
          counts.connected += 1;
          break;
        case "connecting":
          counts.connecting += 1;
          break;
        case "failed":
          counts.failed += 1;
          break;
      }
      return counts;
    },
    { total: 0, connected: 0, connecting: 0, failed: 0 },
  );
}

export function buildServerSummaries(
  servers: readonly PublicServerConfig[],
  connections: ReadonlyMap<string, ConnectionStatus>,
  options: {
    ownerId: string;
    oauthProviders: Record<string, PublicOAuthProviderConfig>;
    oauthConnections: readonly OAuthConnectionStatus[];
  },
): ServerConnectionSummary[] {
  return [...servers]
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((server) => {
      const connection = connections.get(server.name);
      const state = connection?.state ?? "connecting";
      const oauthProviderId =
        server.credential.strategy === "user_oauth"
          ? server.credential.provider
          : undefined;
      const oauthConnection = oauthProviderId
        ? options.oauthConnections.find(
            (entry) => entry.provider === oauthProviderId,
          )
        : undefined;

      const rowAction = deriveRowAction(server, state, oauthConnection);

      return {
        name: server.name,
        endpoint: server.transport.url,
        credentialStrategy: server.credential.strategy,
        credentialSubStatus: formatCredentialSubStatus(server.credential, {
          oauthProviderConfig: oauthProviderId
            ? options.oauthProviders[oauthProviderId]
            : undefined,
          oauthConnection,
        }),
        policySummary: formatPolicySummary(server.policy),
        policyAllowTooltip: formatPolicyTooltip(server.policy),
        toolCount:
          state === "connected" && connection?.toolCount !== undefined
            ? connection.toolCount
            : null,
        state,
        error: connection?.error,
        ...rowAction,
      };
    });
}
