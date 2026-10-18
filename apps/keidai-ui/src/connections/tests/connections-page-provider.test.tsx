import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConnectionsPageProvider } from "../context/connections-page-provider.js";

const {
  reconnectAllConnections,
  reconnectConnection,
  liveConnections,
  serversState,
  oauthConnectionsState,
} = vi.hoisted(() => ({
  reconnectAllConnections: vi.fn(async () => undefined),
  reconnectConnection: vi.fn(async () => undefined),
  liveConnections: {
    connections: new Map(),
    error: undefined as Error | undefined,
    isLoading: false,
  },
  serversState: {
    servers: [] as Array<{
      name: string;
      transport: { type: "http"; url: string };
      credential:
        | { strategy: "none" }
        | { strategy: "user_oauth"; provider: string };
      policy: { default: "allow" };
    }>,
  },
  oauthConnectionsState: {
    byOwner: new Map<
      string,
      Array<{
        provider: string;
        ownerId: string;
        status: "linked" | "not_linked";
        scopes: string[];
      }>
    >(),
  },
}));

vi.mock("../../lib/api/gateway.js", () => ({
  reconnectAllConnections,
  reconnectConnection,
  deleteConnector: vi.fn(async () => undefined),
  unlinkOAuthConnection: vi.fn(async () => undefined),
}));

vi.mock("../../lib/hooks/use-fetch-servers.js", () => ({
  SERVERS_KEY: "torii-servers",
  useFetchServers: () => ({
    data: { servers: serversState.servers },
    error: undefined,
    isLoading: false,
  }),
}));

vi.mock("../../lib/hooks/use-fetch-oauth-providers.js", () => ({
  OAUTH_PROVIDERS_KEY: "torii-oauth-providers",
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
    data: oauthConnectionsState.byOwner,
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
    reconnectConnection.mockClear();
    liveConnections.connections = new Map();
    liveConnections.error = undefined;
    liveConnections.isLoading = false;
    serversState.servers = [];
    oauthConnectionsState.byOwner = new Map();
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

  it("skips unlinked user_oauth servers on mount so they do not fire failing handshakes", async () => {
    serversState.servers = [
      {
        name: "deepwiki",
        transport: { type: "http", url: "https://mcp.deepwiki.com/mcp" },
        credential: { strategy: "none" },
        policy: { default: "allow" },
      },
      {
        name: "github",
        transport: { type: "http", url: "https://api.githubcopilot.com/mcp/" },
        credential: { strategy: "user_oauth", provider: "github" },
        policy: { default: "allow" },
      },
    ];
    oauthConnectionsState.byOwner = new Map([
      [
        "demo-owner",
        [
          {
            provider: "github",
            ownerId: "demo-owner",
            status: "not_linked",
            scopes: ["repo"],
          },
        ],
      ],
    ]);

    render(
      <MemoryRouter>
        <ConnectionsPageProvider>
          <div />
        </ConnectionsPageProvider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(reconnectConnection).toHaveBeenCalledWith("deepwiki", "demo-owner");
    });
    expect(reconnectAllConnections).not.toHaveBeenCalled();
    expect(reconnectConnection).not.toHaveBeenCalledWith(
      "github",
      "demo-owner",
    );
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
