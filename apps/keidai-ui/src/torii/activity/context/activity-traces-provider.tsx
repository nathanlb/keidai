import type { OAuthConnectionStatus } from "@keidai/shared";
import type { TraceListItem } from "@keidai/shared";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useActivityTraces } from "../../../shell/hooks/use-activity-traces.js";
import { useFetchOAuthProviders } from "../../../shell/hooks/use-fetch-oauth-providers.js";
import { useFetchServers } from "../../../shell/hooks/use-fetch-servers.js";
import { useFetchTraceStats } from "../../../shell/hooks/use-fetch-trace-stats.js";
import { buildLinkingResolutionKey } from "../../linking/format-linking-required-prompt.js";
import { useOAuthLink } from "../../oauth/context/use-oauth-link.js";
import { buildGatewayOAuthCallbackUrl } from "../../oauth/utils/build-gateway-oauth-callback-url.js";
import { formatProviderLabel } from "../../oauth/utils/oauth-provider-config.js";
import { countTraceOutcomes } from "../utils/count-trace-outcomes.js";
import {
  EMPTY_TRACE_FILTERS,
  filterTraces,
  type TraceFilters,
} from "../utils/filter-traces.js";
import type { OutcomeFilter } from "../utils/format-trace-outcome.js";
import {
  ActivityTracesContext,
  type ActivityTracesContextValue,
} from "./activity-traces-context.js";

function collectResolvedLinkingKeys(
  ownerId: string,
  connections: OAuthConnectionStatus[],
): string[] {
  return connections
    .filter((connection) => connection.status === "linked")
    .map((connection) =>
      buildLinkingResolutionKey(ownerId, connection.provider),
    );
}

interface ActivityTracesProviderProps {
  children: ReactNode;
}

export function ActivityTracesProvider({ children }: ActivityTracesProviderProps) {
  const [isLive, setIsLive] = useState(true);
  const [filters, setFilters] = useState<TraceFilters>(EMPTY_TRACE_FILTERS);
  const [pageIndex, setPageIndex] = useState(0);
  const [selectedTrace, setSelectedTrace] = useState<TraceListItem | null>(
    null,
  );
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [linkingResolvedKeys, setLinkingResolvedKeys] = useState<
    Set<string>
  >(new Set());

  const {
    data: statsData,
    error: statsError,
    isLoading: statsLoading,
  } = useFetchTraceStats();

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

  const {
    traces,
    bufferCount,
    error: tracesError,
    isLoading: tracesLoading,
  } = useActivityTraces(isLive);

  const linkDialog = useOAuthLink();

  const handleLinkCompleted = useCallback(
    (ownerId: string, connections: OAuthConnectionStatus[]) => {
      setLinkingResolvedKeys((current) => {
        const next = new Set(current);
        for (const key of collectResolvedLinkingKeys(ownerId, connections)) {
          next.add(key);
        }
        return next;
      });
    },
    [],
  );

  const serversByName = useMemo(() => {
    return new Map(
      (serversData?.servers ?? []).map((server) => [server.name, server]),
    );
  }, [serversData?.servers]);

  const selectedTraceServer = useMemo(() => {
    if (!selectedTrace) {
      return undefined;
    }
    return serversByName.get(selectedTrace.server);
  }, [selectedTrace, serversByName]);

  const serverOptions = useMemo(() => {
    const names = new Set<string>();
    for (const server of serversData?.servers ?? []) {
      names.add(server.name);
    }
    for (const trace of traces) {
      names.add(trace.server);
    }
    return [...names].sort((left, right) => left.localeCompare(right));
  }, [serversData?.servers, traces]);

  const outcomeCounts = useMemo(() => countTraceOutcomes(traces), [traces]);

  const filteredTraces = useMemo(
    () => filterTraces(traces, filters),
    [filters, traces],
  );

  useEffect(() => {
    setPageIndex(0);
  }, [filters]);

  const onOutcomeChange = useCallback((outcome: OutcomeFilter) => {
    setFilters((current) => ({ ...current, outcome }));
  }, []);

  const onClearFilters = useCallback(() => {
    setFilters(EMPTY_TRACE_FILTERS);
  }, []);

  const onToggleLive = useCallback(() => {
    setIsLive((current) => !current);
  }, []);

  const onOpenTrace = useCallback((trace: TraceListItem) => {
    setSelectedTrace(trace);
    setDrawerOpen(true);
  }, []);

  const linkProvider = useCallback(
    (providerId: string, ownerId: string) => {
      const providerConfig = providersData?.providers[providerId];
      if (!providerConfig) {
        return;
      }

      linkDialog.openLink(
        {
          providerId,
          providerLabel: formatProviderLabel(providerId),
          ownerId,
          scopes: providerConfig.scopes,
          redirectUri: buildGatewayOAuthCallbackUrl(providerId),
        },
        { onLinked: handleLinkCompleted },
      );
    },
    [handleLinkCompleted, linkDialog, providersData?.providers],
  );

  const isLoading =
    (statsLoading && !statsData) ||
    (tracesLoading && traces.length === 0) ||
    (serversLoading && !serversData) ||
    (providersLoading && !providersData);

  const error =
    statsError ?? tracesError ?? serversError ?? providersError;

  const value = useMemo((): ActivityTracesContextValue | null => {
    if (!statsData) {
      return null;
    }

    return {
      stats: statsData,
      traces,
      bufferCount,
      filteredTraces,
      outcomeCounts,
      filters,
      serverOptions,
      pageIndex,
      isLive,
      selectedTrace,
      selectedTraceServer,
      drawerOpen,
      linkingResolvedKeys,
      setFilters,
      onOutcomeChange,
      onClearFilters,
      onToggleLive,
      onPageChange: setPageIndex,
      onOpenTrace,
      onDrawerOpenChange: setDrawerOpen,
      linkProvider,
    };
  }, [
    statsData,
    traces,
    bufferCount,
    filteredTraces,
    outcomeCounts,
    filters,
    serverOptions,
    pageIndex,
    isLive,
    selectedTrace,
    selectedTraceServer,
    drawerOpen,
    linkingResolvedKeys,
    onOutcomeChange,
    onClearFilters,
    onToggleLive,
    onOpenTrace,
    linkProvider,
  ]);

  if (isLoading) {
    return (
      <p className="text-sm text-muted-foreground">Loading activity…</p>
    );
  }

  if (error || !value) {
    return (
      <p className="text-sm text-destructive">
        Could not load activity from the gateway.
      </p>
    );
  }

  return (
    <ActivityTracesContext.Provider value={value}>
      {children}
    </ActivityTracesContext.Provider>
  );
}
