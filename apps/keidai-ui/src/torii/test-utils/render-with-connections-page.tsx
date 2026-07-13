import type { ReactElement, ReactNode } from "react";
import {
  render,
  type RenderOptions,
  type RenderResult,
} from "@testing-library/react";
import { vi } from "vitest";
import {
  ConnectionsPageContext,
  type ConnectionsPageContextValue,
} from "../connections/context/connections-page-context.js";
import { OAuthLinkProvider } from "../oauth/context/oauth-link-provider.js";

const noop = () => {};

const defaultConnectionsPageContext: ConnectionsPageContextValue = {
  summaries: [],
  counts: { total: 0, connected: 0, connecting: 0, failed: 0 },
  reconnectingServers: new Set(),
  isReconnectingAll: false,
  linkingRequiredTrace: null,
  selectedSummary: null,
  drawerOpen: false,
  onReconnect: noop,
  onReconnectAll: noop,
  onLink: noop,
  onLinkFromBanner: noop,
  isServerReconnecting: () => false,
  onOpenServer: noop,
  onDrawerOpenChange: noop,
};

export function createConnectionsPageContextValue(
  overrides: Partial<ConnectionsPageContextValue> = {},
): ConnectionsPageContextValue {
  return {
    ...defaultConnectionsPageContext,
    ...overrides,
  };
}

interface ConnectionsPageWrapperProps {
  children: ReactNode;
  value?: Partial<ConnectionsPageContextValue>;
}

function ConnectionsPageWrapper({
  children,
  value,
}: ConnectionsPageWrapperProps) {
  return (
    <ConnectionsPageContext.Provider
      value={createConnectionsPageContextValue(value)}
    >
      <OAuthLinkProvider>{children}</OAuthLinkProvider>
    </ConnectionsPageContext.Provider>
  );
}

export function renderWithConnectionsPage(
  ui: ReactElement,
  value?: Partial<ConnectionsPageContextValue>,
  options?: Omit<RenderOptions, "wrapper">,
): RenderResult {
  return render(ui, {
    wrapper: ({ children }) => (
      <ConnectionsPageWrapper value={value}>{children}</ConnectionsPageWrapper>
    ),
    ...options,
  });
}

export function createMockReconnect() {
  return vi.fn();
}

export function createMockLink() {
  return vi.fn();
}
