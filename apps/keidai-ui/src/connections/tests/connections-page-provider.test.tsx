import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConnectionsPageProvider } from "../context/connections-page-provider.js";

const { reconnectAllConnections } = vi.hoisted(() => ({
  reconnectAllConnections: vi.fn(async () => undefined),
}));

vi.mock("../../lib/api/gateway.js", () => ({
  reconnectAllConnections,
  reconnectConnection: vi.fn(async () => undefined),
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
  useLiveConnections: () => ({
    connections: new Map(),
    error: undefined,
    isLoading: false,
  }),
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
  });

  it("reconnects all backends when the page is visited", async () => {
    render(
      <ConnectionsPageProvider>
        <div />
      </ConnectionsPageProvider>,
    );

    await waitFor(() => {
      expect(reconnectAllConnections).toHaveBeenCalledWith("demo-owner");
    });
    expect(reconnectAllConnections).toHaveBeenCalledTimes(1);
  });
});
