import { createContext } from "react";
import type { PublicServerConfig } from "@keidai/shared/dto";
import type { TraceListItem } from "@keidai/shared";
import type {
  ConnectionSummaryCounts,
  ServerConnectionSummary,
} from "../utils/build-server-summaries.js";

export interface ConnectionsPageContextValue {
  summaries: ServerConnectionSummary[];
  counts: ConnectionSummaryCounts;
  reconnectingServers: ReadonlySet<string>;
  isReconnectingAll: boolean;
  linkingRequiredTrace: TraceListItem | null;
  linkingRequiredServer?: PublicServerConfig;
  selectedSummary: ServerConnectionSummary | null;
  selectedServer?: PublicServerConfig;
  drawerOpen: boolean;
  onReconnect: (serverName: string) => void;
  onReconnectAll: () => void;
  onLink: (providerId: string) => void;
  onLinkFromBanner: (providerId: string, ownerId: string) => void;
  isServerReconnecting: (serverName: string) => boolean;
  onOpenServer: (serverName: string) => void;
  onDrawerOpenChange: (open: boolean) => void;
}

export const ConnectionsPageContext =
  createContext<ConnectionsPageContextValue | null>(null);
