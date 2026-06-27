import type { PublicOAuthProviderConfig } from "@keidai/shared";

export type OAuthProviderAggregateStatus =
  | "linked"
  | "not_linked"
  | "expired"
  | "misconfigured";

const providerLabels: Record<string, string> = {
  github: "GitHub",
  google: "Google",
};

export function formatProviderLabel(providerId: string): string {
  const known = providerLabels[providerId.toLowerCase()];
  if (known) {
    return known;
  }

  if (!providerId) {
    return providerId;
  }

  return providerId.charAt(0).toUpperCase() + providerId.slice(1);
}

export function isProviderMisconfigured(
  config: PublicOAuthProviderConfig,
): boolean {
  if (config.registration_endpoint) {
    return !config.token_url || !config.redirect_uri;
  }

  return !config.client_id || !config.token_url || !config.redirect_uri;
}

export function formatClientIdDisplay(
  config: PublicOAuthProviderConfig,
): string {
  if (config.registration_endpoint) {
    return "dynamic (RFC 7591)";
  }

  if (!config.client_id) {
    return "not configured";
  }

  if (config.client_id.length <= 16) {
    return config.client_id;
  }

  return `${config.client_id.slice(0, 8)}…`;
}

export function formatClientSecretLabel(
  config: PublicOAuthProviderConfig,
): { label: string; missing: boolean } {
  if (config.registration_endpoint) {
    return { label: "dynamic registration", missing: false };
  }

  if (!config.client_id) {
    return { label: "not set", missing: true };
  }

  return { label: "configured (hidden)", missing: false };
}

export function formatPkceLabel(config: PublicOAuthProviderConfig): string {
  return config.pkce === false ? "disabled" : "enabled";
}
