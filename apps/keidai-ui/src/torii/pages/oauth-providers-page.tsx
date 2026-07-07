import { useCallback, useMemo } from "react";
import type { OAuthConnectionStatus } from "@keidai/shared";
import { useActingOwner } from "../../shell/hooks/use-acting-owner.js";
import { useFetchAgents } from "../../shell/hooks/use-fetch-agents.js";
import { useFetchOAuthConnections } from "../../shell/hooks/use-fetch-oauth-connections.js";
import { useFetchOAuthProviders } from "../../shell/hooks/use-fetch-oauth-providers.js";
import { buildOAuthProviderSummaries } from "../oauth/utils/build-oauth-provider-summaries.js";
import { buildGatewayOAuthCallbackUrl } from "../oauth/utils/build-gateway-oauth-callback-url.js";
import { useOAuthLink } from "../oauth/context/use-oauth-link.js";
import { OAuthProvidersView } from "../oauth/oauth-providers-view.js";

export function OAuthProvidersPage() {
  const {
    data: providersData,
    error: providersError,
    isLoading: providersLoading,
  } = useFetchOAuthProviders();

  const {
    data: agentsData,
    error: agentsError,
    isLoading: agentsLoading,
  } = useFetchAgents();

  const { owner } = useActingOwner();

  const ownerIds = useMemo(
    () => [
      ...new Set((agentsData?.agents ?? []).map((agent) => agent.owner_id)),
    ],
    [agentsData],
  );

  const {
    data: connectionsByOwner,
    error: connectionsError,
    isLoading: connectionsLoading,
    patchOwnerConnections,
    refresh: refreshConnections,
  } = useFetchOAuthConnections(ownerIds);

  const handleLinkCompleted = useCallback(
    async (ownerId: string, connections: OAuthConnectionStatus[]) => {
      await patchOwnerConnections(ownerId, connections);
      await refreshConnections();
    },
    [patchOwnerConnections, refreshConnections],
  );

  const linkDialog = useOAuthLink();

  const isLoading =
    providersLoading ||
    agentsLoading ||
    (ownerIds.length > 0 && connectionsLoading && !connectionsByOwner);

  const error = providersError ?? agentsError ?? connectionsError;

  const summaries = useMemo(
    () =>
      buildOAuthProviderSummaries(
        providersData?.providers ?? {},
        ownerIds,
        connectionsByOwner ?? new Map(),
      ),
    [connectionsByOwner, ownerIds, providersData],
  );

  const handleLinkProvider = useCallback(
    (providerId: string) => {
      const summary = summaries.find((entry) => entry.id === providerId);
      if (!summary || summary.aggregateStatus === "misconfigured") {
        return;
      }

      linkDialog.openLink(
        {
          providerId,
          providerLabel: summary.label,
          ownerId: owner.ownerId,
          scopes: summary.config.scopes,
          redirectUri: buildGatewayOAuthCallbackUrl(providerId),
        },
        { onLinked: handleLinkCompleted },
      );
    },
    [handleLinkCompleted, linkDialog, owner.ownerId, summaries],
  );

  if (isLoading && !providersData) {
    return (
      <p className="text-sm text-muted-foreground">Loading OAuth providers…</p>
    );
  }

  if (error) {
    return (
      <p className="text-sm text-destructive">
        Could not load OAuth provider configuration from the gateway.
      </p>
    );
  }

  return (
    <OAuthProvidersView
      providers={summaries}
      onLinkProvider={handleLinkProvider}
    />
  );
}
