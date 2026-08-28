import type { OAuthConnectionStatus } from "@keidai/shared";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { mutate } from "swr";
import {
  reconnectAllConnections,
  reconnectConnection,
  deleteConnector,
  unlinkOAuthConnection,
} from "../../lib/api/gateway.js";
import { useActingOwner } from "../../shell/hooks/use-acting-owner.js";
import { useFetchLinkingRequiredTrace } from "../../lib/hooks/use-fetch-linking-required-trace.js";
import { useFetchOAuthConnections } from "../../lib/hooks/use-fetch-oauth-connections.js";
import { useFetchOAuthProviders } from "../../lib/hooks/use-fetch-oauth-providers.js";
import { OAUTH_PROVIDERS_KEY } from "../../lib/hooks/use-fetch-oauth-providers.js";
import { SERVER_TOOLS_KEY } from "../../lib/hooks/use-fetch-server-tools.js";
import {
  SERVERS_KEY,
  useFetchServers,
} from "../../lib/hooks/use-fetch-servers.js";
import {
  CONNECTORS_KEY,
  useFetchConnectors,
} from "../../lib/hooks/use-fetch-connectors.js";
import { useLiveConnections } from "../../lib/hooks/use-live-connections.js";
import { isLinkingStillRequired } from "../linking/format-linking-required-prompt.js";
import { useOAuthLink } from "../../oauth/context/use-oauth-link.js";
import { buildToriiOAuthCallbackUrl } from "../../oauth/utils/build-torii-oauth-callback-url.js";
import { formatProviderLabel } from "../../oauth/utils/oauth-provider-config.js";
import {
  buildServerSummaries,
  summarizeConnectionCounts,
} from "../utils/build-server-summaries.js";
import {
  ConnectionsPageContext,
  type ConnectionsPageContextValue,
} from "./connections-page-context.js";

interface ConnectionsPageProviderProps {
  children: ReactNode;
}

export function ConnectionsPageProvider({
  children,
}: ConnectionsPageProviderProps) {
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

  const { data: connectorsData } = useFetchConnectors();

  const { owner } = useActingOwner();
  const ownerIds = useMemo(() => (owner ? [owner.ownerId] : []), [owner]);

  const {
    data: connectionsByOwner,
    error: oauthConnectionsError,
    isLoading: oauthConnectionsLoading,
    patchOwnerConnections,
    refresh: refreshConnections,
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
  const [selectedServerName, setSelectedServerName] = useState<string | null>(
    null,
  );
  const [drawerOpen, setDrawerOpen] = useState(false);

  const { trace: linkingRequiredTrace, refresh: refreshLinkingRequiredTrace } =
    useFetchLinkingRequiredTrace(owner?.ownerId ?? null);

  const oauthConnections = useMemo(
    () => (owner ? (connectionsByOwner?.get(owner.ownerId) ?? []) : []),
    [connectionsByOwner, owner],
  );
  const linkDialog = useOAuthLink();

  const handleLinkCompleted = useCallback(
    async (ownerId: string, connections: OAuthConnectionStatus[]) => {
      await patchOwnerConnections(ownerId, connections);
      await refreshConnections();
      await refreshLinkingRequiredTrace();

      // user_oauth MCP handshakes need the owner token — reconnect now that
      // the grant exists (boot connect had no principal).
      const providerIds = new Set(
        connections
          .filter((connection) => connection.status === "linked")
          .map((connection) => connection.provider),
      );
      const serversToReconnect = (serversData?.servers ?? [])
        .filter(
          (server) =>
            server.credential.strategy === "user_oauth" &&
            providerIds.has(server.credential.provider),
        )
        .map((server) => server.name);

      await Promise.all(
        serversToReconnect.map((serverName) =>
          reconnectConnection(serverName, ownerId).catch(() => undefined),
        ),
      );
    },
    [
      patchOwnerConnections,
      refreshConnections,
      refreshLinkingRequiredTrace,
      serversData?.servers,
    ],
  );

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

  const connectorBySlug = useMemo(
    () =>
      new Map(
        (connectorsData?.connectors ?? []).map((connector) => [
          connector.slug,
          connector,
        ]),
      ),
    [connectorsData?.connectors],
  );

  const summaries = useMemo(
    () =>
      buildServerSummaries(serversData?.servers ?? [], liveConnections, {
        ownerId: owner?.ownerId ?? "",
        oauthProviders: providersData?.providers ?? {},
        oauthConnections,
      }).map((summary) => {
        const connector = connectorBySlug.get(summary.name);
        return {
          ...summary,
          icon: connector?.icon ?? connector?.catalogId ?? summary.name,
        };
      }),
    [
      connectorBySlug,
      liveConnections,
      oauthConnections,
      owner?.ownerId,
      providersData?.providers,
      serversData?.servers,
    ],
  );

  const counts = useMemo(
    () => summarizeConnectionCounts(summaries),
    [summaries],
  );

  const onReconnect = useCallback(
    async (serverName: string) => {
      if (!owner) {
        return;
      }
      setReconnectingServers((current) => new Set(current).add(serverName));
      try {
        await reconnectConnection(serverName, owner.ownerId);
        await mutate([SERVER_TOOLS_KEY, serverName]);
      } finally {
        setReconnectingServers((current) => {
          const next = new Set(current);
          next.delete(serverName);
          return next;
        });
      }
    },
    [owner],
  );

  const onReconnectAll = useCallback(async () => {
    if (!owner) {
      return;
    }
    setIsReconnectingAll(true);
    try {
      await reconnectAllConnections(owner.ownerId);
      await mutate(
        (key) => Array.isArray(key) && key[0] === SERVER_TOOLS_KEY,
        undefined,
        { revalidate: true },
      );
    } finally {
      setIsReconnectingAll(false);
    }
  }, [owner]);

  const onReconnectAllRef = useRef(onReconnectAll);
  const ownerId = owner?.ownerId;

  useEffect(() => {
    onReconnectAllRef.current = onReconnectAll;
  });

  useEffect(() => {
    if (!ownerId) {
      return;
    }

    // Visiting Connections is the operator's refresh signal — backends often
    // sit idle until the next agent tools/list. Reconnect so the table matches
    // what Torii currently sees. The timeout collapses React Strict Mode's
    // double-invoke into a single request.
    const handle = window.setTimeout(() => {
      void onReconnectAllRef.current();
    }, 0);
    return () => window.clearTimeout(handle);
  }, [ownerId]);

  const openLinkDialog = useCallback(
    (providerId: string, ownerId: string) => {
      const providerConfig = providersData?.providers[providerId];
      linkDialog.openLink(
        {
          providerId,
          providerLabel: formatProviderLabel(providerId),
          ownerId,
          scopes: providerConfig?.scopes ?? [],
          redirectUri: buildToriiOAuthCallbackUrl(providerId),
        },
        { onLinked: handleLinkCompleted },
      );
    },
    [handleLinkCompleted, linkDialog, providersData?.providers],
  );

  const onLink = useCallback(
    (providerId: string) => {
      if (!owner) {
        return;
      }
      openLinkDialog(providerId, owner.ownerId);
    },
    [openLinkDialog, owner],
  );

  const onLinkFromBanner = useCallback(
    (providerId: string, ownerId: string) => {
      openLinkDialog(providerId, ownerId);
    },
    [openLinkDialog],
  );

  const onUnlink = useCallback(
    (providerId: string) => {
      if (!owner) {
        return;
      }
      void (async () => {
        await unlinkOAuthConnection(providerId, owner.ownerId);
        await refreshConnections();
        await refreshLinkingRequiredTrace();
      })();
    },
    [owner, refreshConnections, refreshLinkingRequiredTrace],
  );

  const onDeleteConnector = useCallback(async (slug: string) => {
    await deleteConnector(slug);
    await mutate(CONNECTORS_KEY);
    await mutate(SERVERS_KEY);
    await mutate(OAUTH_PROVIDERS_KEY);
    setDrawerOpen(false);
    setSelectedServerName(null);
  }, []);

  const isServerReconnecting = useCallback(
    (serverName: string) =>
      reconnectingServers.has(serverName) || isReconnectingAll,
    [isReconnectingAll, reconnectingServers],
  );

  const selectedSummary = useMemo(
    () =>
      summaries.find((summary) => summary.name === selectedServerName) ?? null,
    [selectedServerName, summaries],
  );

  const selectedServer = selectedServerName
    ? serversByName.get(selectedServerName)
    : undefined;

  const selectedConnector = useMemo(() => {
    if (!selectedServerName) {
      return null;
    }
    return (
      (connectorsData?.connectors ?? []).find(
        (connector) => connector.slug === selectedServerName,
      ) ?? null
    );
  }, [connectorsData?.connectors, selectedServerName]);

  const onOpenServer = useCallback((serverName: string) => {
    setSelectedServerName(serverName);
    setDrawerOpen(true);
  }, []);

  const onDrawerOpenChange = useCallback((open: boolean) => {
    setDrawerOpen(open);
    if (!open) {
      setSelectedServerName(null);
    }
  }, []);

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

  const value = useMemo((): ConnectionsPageContextValue => {
    return {
      summaries,
      counts,
      reconnectingServers,
      isReconnectingAll,
      linkingRequiredTrace: visibleLinkingRequiredTrace,
      linkingRequiredServer,
      selectedSummary,
      selectedServer,
      selectedConnector,
      drawerOpen,
      onReconnect,
      onReconnectAll,
      onLink,
      onUnlink,
      onDeleteConnector,
      onLinkFromBanner,
      isServerReconnecting,
      onOpenServer,
      onDrawerOpenChange,
    };
  }, [
    summaries,
    counts,
    reconnectingServers,
    isReconnectingAll,
    visibleLinkingRequiredTrace,
    linkingRequiredServer,
    selectedSummary,
    selectedServer,
    selectedConnector,
    drawerOpen,
    onReconnect,
    onReconnectAll,
    onLink,
    onUnlink,
    onDeleteConnector,
    onLinkFromBanner,
    isServerReconnecting,
    onOpenServer,
    onDrawerOpenChange,
  ]);

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
    <ConnectionsPageContext.Provider value={value}>
      {children}
    </ConnectionsPageContext.Provider>
  );
}
