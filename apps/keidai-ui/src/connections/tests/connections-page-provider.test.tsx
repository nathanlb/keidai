import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConnectionsPageProvider } from "../context/connections-page-provider.js";

const { reconnectAllConnections, liveConnections } = vi.hoisted(() => ({
  reconnectAllConnections: vi.fn(async () => undefined),
  liveConnections: {
    connections: new Map(),
    error: undefined as Error | undefined,
    isLoading: false,
  },
}));

vi.mock("../../lib/api/gateway.js", () => ({
  reconnectAllConnections,
  reconnectConnection: vi.fn(async () => undefined),
  deleteConnector: vi.fn(async () => undefined),
  unlinkOAuthConnection: vi.fn(async () => undefined),
}));

vi.mock("../../lib/hooks/use-fetch-servers.js", () => ({
  useFetchServers: () => ({
    data: { servers: [] },
    error: undefined,
    isLoading: false,
  }),
}));

vi.mock("../../lib/hooks/use-fetch-oauth-providers.js", () => ({
  useFetchOAuthProviders: () => ({
    data: { providers: {} },
    error: undefined,
    isLoading: false,
  }),
}));

vi.mock("../../lib/hooks/use-fetch-connectors.js", () => ({
  CONNECTORS_KEY: "torii-connectors",
  useFetchConnectors: () => ({
    data: { connectors: [] },
    error: undefined,
    isLoading: false,
    refresh: vi.fn(),
  }),
}));

vi.mock("../../shell/hooks/use-acting-owner.js", () => ({
  useActingOwner: () => ({
    owner: {
      ownerId: "demo-owner",
      displayName: "Demo",
      initials: "D",
    },
    isLoading: false,
  }),
}));

vi.mock("../../lib/hooks/use-fetch-oauth-connections.js", () => ({
  useFetchOAuthConnections: () => ({
    data: new Map(),
    error: undefined,
    isLoading: false,
    patchOwnerConnections: vi.fn(),
    refresh: vi.fn(),
  }),
}));

vi.mock("../../lib/hooks/use-live-connections.js", () => ({
  useLiveConnections: () => liveConnections,
}));

vi.mock("../../lib/hooks/use-fetch-linking-required-trace.js", () => ({
  useFetchLinkingRequiredTrace: () => ({
    trace: null,
    refresh: vi.fn(),
  }),
}));

vi.mock("../../oauth/context/use-oauth-link.js", () => ({
  useOAuthLink: () => ({
    openLink: vi.fn(),
  }),
}));

describe("ConnectionsPageProvider", () => {
  beforeEach(() => {
    reconnectAllConnections.mockClear();
    liveConnections.connections = new Map();
    liveConnections.error = undefined;
    liveConnections.isLoading = false;
  });

  it("reconnects all backends when the page is visited", async () => {
    render(
      <MemoryRouter>
        <ConnectionsPageProvider>
          <div />
        </ConnectionsPageProvider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(reconnectAllConnections).toHaveBeenCalledWith("demo-owner");
    });
    expect(reconnectAllConnections).toHaveBeenCalledTimes(1);
  });

  it("still renders children when the live connection stream errors", () => {
    liveConnections.error = new Error("Connection event stream interrupted");

    render(
      <MemoryRouter>
        <ConnectionsPageProvider>
          <div>connections-ready</div>
        </ConnectionsPageProvider>
      </MemoryRouter>,
    );

    expect(screen.getByText("connections-ready")).toBeInTheDocument();
    expect(
      screen.queryByText("Could not load connection status from the gateway."),
    ).not.toBeInTheDocument();
  });
});
