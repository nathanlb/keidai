export {
  formatLinkingReason,
  resolveLinkProviderId,
} from "../../linking/format-linking-required-prompt.js";

import type { PublicServerConfig } from "@keidai/shared/dto";
import type { TraceListItem } from "@keidai/shared";

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
