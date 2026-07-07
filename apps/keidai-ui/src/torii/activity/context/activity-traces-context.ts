import { createContext } from "react";
import type { PublicServerConfig } from "@keidai/shared/dto";
import type { TraceListItem, TraceStatsResponse } from "@keidai/shared";
import type { OutcomeCounts } from "../utils/count-trace-outcomes.js";
import type { TraceFilters } from "../utils/filter-traces.js";
import type { OutcomeFilter } from "../utils/format-trace-outcome.js";

export interface ActivityTracesContextValue {
  stats: TraceStatsResponse;
  traces: TraceListItem[];
  bufferCount: number;
  filteredTraces: TraceListItem[];
  outcomeCounts: OutcomeCounts;
  filters: TraceFilters;
  serverOptions: readonly string[];
  pageIndex: number;
  isLive: boolean;
  selectedTrace: TraceListItem | null;
  selectedTraceServer?: PublicServerConfig;
  drawerOpen: boolean;
  linkingResolvedKeys: ReadonlySet<string>;
  setFilters: (filters: TraceFilters) => void;
  onOutcomeChange: (outcome: OutcomeFilter) => void;
  onClearFilters: () => void;
  onToggleLive: () => void;
  onPageChange: (pageIndex: number) => void;
  onOpenTrace: (trace: TraceListItem) => void;
  onDrawerOpenChange: (open: boolean) => void;
  linkProvider: (providerId: string, ownerId: string) => void;
}

export const ActivityTracesContext =
  createContext<ActivityTracesContextValue | null>(null);
