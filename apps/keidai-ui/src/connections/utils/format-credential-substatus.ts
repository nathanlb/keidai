import type {
  OAuthConnectionStatus,
  PublicCredentialConfig,
  PublicOAuthProviderConfig,
} from "@keidai/shared";
import { formatProviderLabel } from "../../oauth/utils/oauth-provider-config.js";
import { isProviderMisconfigured } from "../../oauth/utils/oauth-provider-config.js";

export interface CredentialSubStatus {
  label: string;
  warning: boolean;
}

function oauthSubStatus(
  providerId: string,
  providerConfig: PublicOAuthProviderConfig | undefined,
  connection: OAuthConnectionStatus | undefined,
): CredentialSubStatus {
  if (!providerConfig || isProviderMisconfigured(providerConfig)) {
    return { label: "provider misconfigured", warning: true };
  }

  if (!connection || connection.status === "not_linked") {
    return { label: "not linked", warning: true };
  }

  switch (connection.status) {
    case "linked":
      return { label: `→ ${formatProviderLabel(providerId)}`, warning: false };
    case "expired":
      return { label: "token expired", warning: true };
    case "failed":
      return {
        label: connection.error ?? "authorization failed",
        warning: true,
      };
    case "pending":
      return { label: "authorization in progress", warning: false };
  }
}

export function formatCredentialSubStatus(
  credential: PublicCredentialConfig,
  options: {
    oauthProviderConfig?: PublicOAuthProviderConfig;
    oauthConnection?: OAuthConnectionStatus;
  } = {},
): CredentialSubStatus {
  switch (credential.strategy) {
    case "user_oauth":
      return oauthSubStatus(
        credential.provider,
        options.oauthProviderConfig,
        options.oauthConnection,
      );
    case "service_key":
      return {
        label: `header: ${credential.inject?.header ?? "Authorization"}`,
        warning: false,
      };
    case "none":
      return { label: "public · no auth", warning: false };
  }
}
