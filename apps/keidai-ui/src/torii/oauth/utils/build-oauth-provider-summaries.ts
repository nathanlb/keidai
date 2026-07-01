import type {
  OAuthConnectionStatus,
  OAuthLinkStatus,
  PublicOAuthProviderConfig,
} from "@keidai/shared";
import { deriveOwnerInitials } from "../../../shell/utils/derive-owner-initials.js";
import { buildGatewayOAuthCallbackUrl } from "./build-gateway-oauth-callback-url.js";
import { deriveProviderInitials } from "./derive-provider-initials.js";
import { formatOAuthUrlDisplay } from "./format-oauth-url.js";
import {
  formatClientIdDisplay,
  formatClientSecretLabel,
  formatPkceLabel,
  formatProviderLabel,
  isProviderMisconfigured,
  type OAuthProviderAggregateStatus,
} from "./oauth-provider-config.js";

export interface OwnerGrantRow {
  ownerId: string;
  initials: string;
  status: Exclude<OAuthLinkStatus, "not_linked">;
  healthLabel: string;
}

export interface OAuthProviderSummary {
  id: string;
  label: string;
  initials: string;
  config: PublicOAuthProviderConfig;
  aggregateStatus: OAuthProviderAggregateStatus;
  clientDisplay: string;
  scopesLabel: string;
  ownersLabel: string;
  owners: OwnerGrantRow[];
  secretLabel: string;
  secretMissing: boolean;
  pkceLabel: string;
  authorizeDisplay: string;
  tokenDisplay: string;
  redirectDisplay: string;
  primaryLabel: string;
  primaryVariant: "default" | "outline" | "secondary";
}

function formatOwnerHealth(connection: OAuthConnectionStatus): string {
  switch (connection.status) {
    case "linked":
      return "valid · auto-refreshing";
    case "expired":
      return "refresh failed — re-link needed";
    case "pending":
      return "authorization in progress";
    case "failed":
      return connection.error ?? "authorization failed";
    case "not_linked":
      return "not linked";
  }
}

function deriveAggregateStatus(
  misconfigured: boolean,
  owners: OwnerGrantRow[],
): OAuthProviderAggregateStatus {
  if (misconfigured) {
    return "misconfigured";
  }

  if (owners.some((owner) => owner.status === "linked")) {
    return "linked";
  }

  if (owners.some((owner) => owner.status === "expired")) {
    return "expired";
  }

  return "not_linked";
}

function primaryActionForStatus(
  status: OAuthProviderAggregateStatus,
): Pick<OAuthProviderSummary, "primaryLabel" | "primaryVariant"> {
  switch (status) {
    case "misconfigured":
      return { primaryLabel: "Open config", primaryVariant: "outline" };
    case "not_linked":
      return { primaryLabel: "Link account", primaryVariant: "default" };
    default:
      return { primaryLabel: "Re-link", primaryVariant: "secondary" };
  }
}

function formatOwnersLabel(
  misconfigured: boolean,
  owners: OwnerGrantRow[],
): string {
  if (misconfigured) {
    return "—";
  }

  const linkedCount = owners.filter((owner) => owner.status === "linked").length;
  const denominator = Math.max(1, owners.length);
  return `${linkedCount} of ${denominator} linked`;
}

export function buildOAuthProviderSummaries(
  providers: Record<string, PublicOAuthProviderConfig>,
  ownerIds: readonly string[],
  connectionsByOwner: ReadonlyMap<string, OAuthConnectionStatus[]>,
): OAuthProviderSummary[] {
  return Object.entries(providers)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([id, config]) => {
      const misconfigured = isProviderMisconfigured(config);
      const secret = formatClientSecretLabel(config);
      const owners: OwnerGrantRow[] = [];
      for (const ownerId of ownerIds) {
        const connection = connectionsByOwner
          .get(ownerId)
          ?.find((entry) => entry.provider === id);
        if (!connection || connection.status === "not_linked") {
          continue;
        }

        owners.push({
          ownerId,
          initials: deriveOwnerInitials(ownerId),
          status: connection.status,
          healthLabel: formatOwnerHealth(connection),
        });
      }

      const aggregateStatus = deriveAggregateStatus(misconfigured, owners);
      const primary = primaryActionForStatus(aggregateStatus);

      return {
        id,
        label: formatProviderLabel(id),
        initials: deriveProviderInitials(id),
        config,
        aggregateStatus,
        clientDisplay: formatClientIdDisplay(config),
        scopesLabel: `${config.scopes.length} scopes`,
        ownersLabel: formatOwnersLabel(misconfigured, owners),
        owners,
        secretLabel: secret.label,
        secretMissing: secret.missing,
        pkceLabel: formatPkceLabel(config),
        authorizeDisplay: formatOAuthUrlDisplay(config.authorize_url),
        tokenDisplay: formatOAuthUrlDisplay(config.token_url),
        redirectDisplay: buildGatewayOAuthCallbackUrl(id),
        ...primary,
      };
    });
}
