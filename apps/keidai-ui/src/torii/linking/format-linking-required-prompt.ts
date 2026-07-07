import type { PublicServerConfig } from "@keidai/shared/dto";
import type { OAuthConnectionStatus, TraceListItem } from "@keidai/shared";
import { formatProviderLabel } from "../oauth/utils/oauth-provider-config.js";
import { connectionStatusForProvider } from "../oauth/utils/resolve-oauth-link-outcome.js";

export const LINKING_REQUIRED_BANNER_TITLE =
  "Tool call blocked — linking required";

function parseProviderFromError(error?: string): string | null {
  if (!error) {
    return null;
  }

  const match = error.match(/provider "([^"]+)"/);
  return match?.[1] ?? null;
}

export function resolveLinkProviderId(
  trace: TraceListItem,
  server?: PublicServerConfig,
): string | null {
  if (server?.credential.strategy === "user_oauth") {
    return server.credential.provider;
  }
  return parseProviderFromError(trace.error);
}

export function formatLinkingReason(
  trace: TraceListItem,
  server?: PublicServerConfig,
): string | null {
  if (trace.outcome !== "linking_required") {
    return null;
  }

  const providerId = resolveLinkProviderId(trace, server);
  const ownerId = trace.principal?.ownerId ?? "unknown";

  if (!providerId) {
    return trace.error ?? "No valid OAuth grant for this owner and provider.";
  }

  return `No grant stored for (${ownerId}, ${providerId}). The owner must link ${formatProviderLabel(providerId)} before this tool resolves.`;
}

export function formatLinkingRequiredBannerBody(
  trace: TraceListItem,
): string {
  const ownerId = trace.principal?.ownerId ?? "unknown";
  const gatewayResponse = trace.error?.trim();

  if (gatewayResponse) {
    return `${trace.tool} for owner ${ownerId} returned linking_required: ${gatewayResponse}`;
  }

  return `${trace.tool} for owner ${ownerId} returned linking_required.`;
}

export function formatLinkProviderButtonLabel(providerId: string): string {
  return `Link ${formatProviderLabel(providerId)}`;
}

export function buildLinkingResolutionKey(
  ownerId: string,
  providerId: string,
): string {
  return `${ownerId}:${providerId}`;
}

export function isOAuthProviderLinked(
  connections: readonly OAuthConnectionStatus[],
  providerId: string,
): boolean {
  return connectionStatusForProvider([...connections], providerId) === "linked";
}

export function isLinkingStillRequired(
  trace: TraceListItem,
  server: PublicServerConfig | undefined,
  connections: readonly OAuthConnectionStatus[],
  resolvedKeys: ReadonlySet<string>,
): boolean {
  if (trace.outcome !== "linking_required") {
    return false;
  }

  const ownerId = trace.principal?.ownerId;
  const providerId = resolveLinkProviderId(trace, server);
  if (!ownerId || !providerId) {
    return true;
  }

  if (resolvedKeys.has(buildLinkingResolutionKey(ownerId, providerId))) {
    return false;
  }

  return !isOAuthProviderLinked(connections, providerId);
}
