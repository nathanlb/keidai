import type { PublicServerConfig } from "@keidai/shared/dto";
import type { TraceListItem } from "@keidai/shared";
import { formatProviderLabel } from "../../oauth/utils/oauth-provider-config.js";

export function formatCredentialStrategy(
  server?: PublicServerConfig,
): string {
  if (!server) {
    return "—";
  }

  switch (server.credential.strategy) {
    case "user_oauth":
      return "user_oauth";
    case "service_key":
      return "service_key";
    case "none":
      return "none (public)";
  }
}

export function formatCredentialProvider(
  server?: PublicServerConfig,
): string {
  if (server?.credential.strategy === "user_oauth") {
    return server.credential.provider;
  }
  return "—";
}

export function formatCredentialRef(trace: TraceListItem): string {
  return trace.credentialRef ?? "— none resolved";
}

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
