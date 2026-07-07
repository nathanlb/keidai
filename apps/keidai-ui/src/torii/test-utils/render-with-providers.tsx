import type { ReactElement, ReactNode } from "react";
import {
  render,
  type RenderOptions,
  type RenderResult,
} from "@testing-library/react";
import { vi } from "vitest";
import {
  ActivityTracesContext,
  type ActivityTracesContextValue,
} from "../activity/context/activity-traces-context.js";
import { EMPTY_TRACE_FILTERS } from "../activity/utils/filter-traces.js";
import { OAuthLinkProvider } from "../oauth/context/oauth-link-provider.js";

const noop = () => {};

const defaultActivityTracesContext: ActivityTracesContextValue = {
  stats: {
    windowMs: 3_600_000,
    callsPerMinute: 0,
    successRate: 1,
    p50DurationMs: null,
    p95DurationMs: null,
    deniedCount: 0,
    linkingRequiredCount: 0,
  },
  traces: [],
  bufferCount: 0,
  filteredTraces: [],
  outcomeCounts: {
    all: 0,
    success: 0,
    error: 0,
    denied: 0,
    linking_required: 0,
  },
  filters: EMPTY_TRACE_FILTERS,
  serverOptions: [],
  pageIndex: 0,
  isLive: true,
  selectedTrace: null,
  drawerOpen: false,
  linkingResolvedKeys: new Set(),
  setFilters: noop,
  onOutcomeChange: noop,
  onClearFilters: noop,
  onToggleLive: noop,
  onPageChange: noop,
  onOpenTrace: noop,
  onDrawerOpenChange: noop,
  linkProvider: noop,
};

export function createActivityTracesContextValue(
  overrides: Partial<ActivityTracesContextValue> = {},
): ActivityTracesContextValue {
  return {
    ...defaultActivityTracesContext,
    ...overrides,
  };
}

interface ActivityTracesWrapperProps {
  children: ReactNode;
  value?: Partial<ActivityTracesContextValue>;
}

function ActivityTracesWrapper({
  children,
  value,
}: ActivityTracesWrapperProps) {
  return (
    <ActivityTracesContext.Provider
      value={createActivityTracesContextValue(value)}
    >
      {children}
    </ActivityTracesContext.Provider>
  );
}

export function renderWithActivityTracesPage(
  ui: ReactElement,
  value?: Partial<ActivityTracesContextValue>,
  options?: Omit<RenderOptions, "wrapper">,
): RenderResult {
  return render(ui, {
    wrapper: ({ children }) => (
      <ActivityTracesWrapper value={value}>{children}</ActivityTracesWrapper>
    ),
    ...options,
  });
}

export function renderWithOAuthLink(
  ui: ReactElement,
  options?: Omit<RenderOptions, "wrapper">,
): RenderResult {
  return render(ui, {
    wrapper: ({ children }) => <OAuthLinkProvider>{children}</OAuthLinkProvider>,
    ...options,
  });
}

export function createMockLinkProvider() {
  return vi.fn<(providerId: string, ownerId: string) => void>();
}
