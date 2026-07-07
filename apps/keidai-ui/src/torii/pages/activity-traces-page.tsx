import { useCallback, useEffect, useMemo, useState } from "react";
import type { OAuthConnectionStatus } from "@keidai/shared";
import type { TraceListItem } from "@keidai/shared";
import { useActivityTraces } from "../../shell/hooks/use-activity-traces.js";
import { useFetchOAuthProviders } from "../../shell/hooks/use-fetch-oauth-providers.js";
import { useFetchServers } from "../../shell/hooks/use-fetch-servers.js";
import { useFetchTraceStats } from "../../shell/hooks/use-fetch-trace-stats.js";
import { ActivityTracesView } from "../activity/activity-traces-view.js";
import { countTraceOutcomes } from "../activity/utils/count-trace-outcomes.js";
import {
  EMPTY_TRACE_FILTERS,
  filterTraces,
  type TraceFilters,
} from "../activity/utils/filter-traces.js";
import type { OutcomeFilter } from "../activity/utils/format-trace-outcome.js";
import { buildLinkingResolutionKey } from "../linking/format-linking-required-prompt.js";
import { OAuthLinkDialog } from "../oauth/oauth-link-dialog.js";
import { useOAuthLinkDialog } from "../oauth/hooks/use-oauth-link-dialog.js";
import { buildGatewayOAuthCallbackUrl } from "../oauth/utils/build-gateway-oauth-callback-url.js";
import { formatProviderLabel } from "../oauth/utils/oauth-provider-config.js";

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

export function ActivityTracesPage() {
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

  const linkDialog = useOAuthLinkDialog(handleLinkCompleted);

  const serversByName = useMemo(() => {
    const map = new Map(
      (serversData?.servers ?? []).map((server) => [server.name, server]),
    );
    return map;
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

  const handleOutcomeChange = useCallback((outcome: OutcomeFilter) => {
    setFilters((current) => ({ ...current, outcome }));
  }, []);

  const handleClearFilters = useCallback(() => {
    setFilters(EMPTY_TRACE_FILTERS);
  }, []);

  const handleOpenTrace = useCallback((trace: TraceListItem) => {
    setSelectedTrace(trace);
    setDrawerOpen(true);
  }, []);

  const handleLinkProvider = useCallback(
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

  const isLoading =
    (statsLoading && !statsData) ||
    (tracesLoading && traces.length === 0) ||
    (serversLoading && !serversData) ||
    (providersLoading && !providersData);

  const error =
    statsError ?? tracesError ?? serversError ?? providersError;

  if (isLoading) {
    return (
      <p className="text-sm text-muted-foreground">Loading activity…</p>
    );
  }

  if (error || !statsData) {
    return (
      <p className="text-sm text-destructive">
        Could not load activity from the gateway.
      </p>
    );
  }

  return (
    <>
      <ActivityTracesView
        stats={statsData}
        traces={traces}
        bufferCount={bufferCount}
        filteredTraces={filteredTraces}
        outcomeCounts={outcomeCounts}
        filters={filters}
        serverOptions={serverOptions}
        pageIndex={pageIndex}
        isLive={isLive}
        selectedTrace={selectedTrace}
        selectedTraceServer={selectedTraceServer}
        drawerOpen={drawerOpen}
        onFiltersChange={setFilters}
        onOutcomeChange={handleOutcomeChange}
        onClearFilters={handleClearFilters}
        onToggleLive={() => setIsLive((current) => !current)}
        onPageChange={setPageIndex}
        onOpenTrace={handleOpenTrace}
        onDrawerOpenChange={setDrawerOpen}
        onLinkProvider={handleLinkProvider}
        linkingResolvedKeys={linkingResolvedKeys}
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
