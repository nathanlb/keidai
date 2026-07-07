import { useCallback, useMemo, useState } from "react";
import type { OAuthConnectionStatus } from "@keidai/shared";
import {
  reconnectAllConnections,
  reconnectConnection,
} from "../../shell/api/gateway-client.js";
import { useActingOwner } from "../../shell/hooks/use-acting-owner.js";
import { useFetchLinkingRequiredTrace } from "../../shell/hooks/use-fetch-linking-required-trace.js";
import { useFetchOAuthConnections } from "../../shell/hooks/use-fetch-oauth-connections.js";
import { useFetchOAuthProviders } from "../../shell/hooks/use-fetch-oauth-providers.js";
import { useFetchServers } from "../../shell/hooks/use-fetch-servers.js";
import { useLiveConnections } from "../../shell/hooks/use-live-connections.js";
import { OAuthLinkDialog } from "../oauth/oauth-link-dialog.js";
import { useOAuthLinkDialog } from "../oauth/hooks/use-oauth-link-dialog.js";
import { buildGatewayOAuthCallbackUrl } from "../oauth/utils/build-gateway-oauth-callback-url.js";
import { formatProviderLabel } from "../oauth/utils/oauth-provider-config.js";
import { ConnectionsView } from "../connections/connections-view.js";
import {
  buildServerSummaries,
  summarizeConnectionCounts,
} from "../connections/utils/build-server-summaries.js";
import {
  isLinkingStillRequired,
} from "../linking/format-linking-required-prompt.js";

export function ConnectionsPage() {
  const {
    data: serversData,
    error: serversError,
    isLoading: serversLoading,
  } = useFetchServers();

  const {
    data: providersData,
    error: providersError,
    isLoading: providersLoading,
  } = useFetchOAuthProviders();

  const { owner } = useActingOwner();
  const ownerIds = useMemo(() => [owner.ownerId], [owner.ownerId]);

  const {
    data: connectionsByOwner,
    error: oauthConnectionsError,
    isLoading: oauthConnectionsLoading,
    patchOwnerConnections,
  } = useFetchOAuthConnections(ownerIds);

  const {
    connections: liveConnections,
    error: liveConnectionsError,
    isLoading: liveConnectionsLoading,
  } = useLiveConnections();

  const [reconnectingServers, setReconnectingServers] = useState<Set<string>>(
    new Set(),
  );
  const [isReconnectingAll, setIsReconnectingAll] = useState(false);

  const {
    trace: linkingRequiredTrace,
    refresh: refreshLinkingRequiredTrace,
  } = useFetchLinkingRequiredTrace(owner.ownerId);

  const oauthConnections = connectionsByOwner?.get(owner.ownerId) ?? [];

  const handleLinkCompleted = useCallback(
    async (ownerId: string, connections: OAuthConnectionStatus[]) => {
      await patchOwnerConnections(ownerId, connections);
      await refreshLinkingRequiredTrace();
    },
    [patchOwnerConnections, refreshLinkingRequiredTrace],
  );

  const linkDialog = useOAuthLinkDialog(handleLinkCompleted);

  const serversByName = useMemo(() => {
    return new Map(
      (serversData?.servers ?? []).map((server) => [server.name, server]),
    );
  }, [serversData?.servers]);

  const linkingRequiredServer = useMemo(() => {
    if (!linkingRequiredTrace) {
      return undefined;
    }
    return serversByName.get(linkingRequiredTrace.server);
  }, [linkingRequiredTrace, serversByName]);

  const visibleLinkingRequiredTrace = useMemo(() => {
    if (!linkingRequiredTrace) {
      return null;
    }

    return isLinkingStillRequired(
      linkingRequiredTrace,
      linkingRequiredServer,
      oauthConnections,
      new Set(),
    )
      ? linkingRequiredTrace
      : null;
  }, [linkingRequiredServer, linkingRequiredTrace, oauthConnections]);

  const summaries = useMemo(
    () =>
      buildServerSummaries(serversData?.servers ?? [], liveConnections, {
        ownerId: owner.ownerId,
        oauthProviders: providersData?.providers ?? {},
        oauthConnections,
      }),
    [
      liveConnections,
      oauthConnections,
      owner.ownerId,
      providersData?.providers,
      serversData?.servers,
    ],
  );

  const counts = useMemo(
    () => summarizeConnectionCounts(summaries),
    [summaries],
  );

  const handleReconnect = useCallback(async (serverName: string) => {
    setReconnectingServers((current) => new Set(current).add(serverName));
    try {
      await reconnectConnection(serverName);
    } finally {
      setReconnectingServers((current) => {
        const next = new Set(current);
        next.delete(serverName);
        return next;
      });
    }
  }, []);

  const handleReconnectAll = useCallback(async () => {
    setIsReconnectingAll(true);
    try {
      await reconnectAllConnections();
    } finally {
      setIsReconnectingAll(false);
    }
  }, []);

  const openLinkDialog = useCallback(
    (providerId: string, ownerId: string) => {
      const providerConfig = providersData?.providers[providerId];
      if (!providerConfig) {
        return;
      }

      linkDialog.openLink({
        providerId,
        providerLabel: formatProviderLabel(providerId),
        ownerId,
        scopes: providerConfig.scopes,
        redirectUri: buildGatewayOAuthCallbackUrl(providerId),
      });
    },
    [linkDialog, providersData?.providers],
  );

  const handleLink = useCallback(
    (providerId: string) => {
      openLinkDialog(providerId, owner.ownerId);
    },
    [openLinkDialog, owner.ownerId],
  );

  const handleLinkFromBanner = useCallback(
    (providerId: string, ownerId: string) => {
      openLinkDialog(providerId, ownerId);
    },
    [openLinkDialog],
  );

  const isLoading =
    serversLoading ||
    providersLoading ||
    liveConnectionsLoading ||
    (ownerIds.length > 0 && oauthConnectionsLoading && !connectionsByOwner);

  const error =
    serversError ??
    providersError ??
    oauthConnectionsError ??
    liveConnectionsError;

  if (isLoading && !serversData) {
    return (
      <p className="text-sm text-muted-foreground">Loading connections…</p>
    );
  }

  if (error) {
    return (
      <p className="text-sm text-destructive">
        Could not load connection status from the gateway.
      </p>
    );
  }

  return (
    <>
      <ConnectionsView
        summaries={summaries}
        counts={counts}
        reconnectingServers={reconnectingServers}
        isReconnectingAll={isReconnectingAll}
        linkingRequiredTrace={visibleLinkingRequiredTrace}
        linkingRequiredServer={linkingRequiredServer}
        onReconnect={handleReconnect}
        onReconnectAll={handleReconnectAll}
        onLink={handleLink}
        onLinkFromBanner={handleLinkFromBanner}
      />
      <OAuthLinkDialog
        open={linkDialog.open}
        step={linkDialog.step}
        context={linkDialog.context}
        errorMessage={linkDialog.errorMessage}
        isSubmitting={linkDialog.isSubmitting}
        onClose={linkDialog.close}
        onBeginAuthorization={linkDialog.beginAuthorization}
        onReopenAuthorization={linkDialog.reopenAuthorization}
        onConfirmFinished={linkDialog.confirmFinished}
        onRetry={linkDialog.retry}
      />
    </>
  );
}
