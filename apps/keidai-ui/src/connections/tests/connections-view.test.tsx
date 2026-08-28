import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ConnectionsView } from "../connections-view.js";
import { renderWithConnectionsPage } from "../test-utils/render-with-connections-page.js";
import type { ServerConnectionSummary } from "../utils/build-server-summaries.js";

vi.mock("../../lib/hooks/use-fetch-connector-catalog.js", () => ({
  useFetchConnectorCatalog: () => ({
    data: { catalog: [], version: "1" },
    isLoading: false,
    error: undefined,
    refresh: vi.fn(),
  }),
}));

const githubSummary: ServerConnectionSummary = {
  name: "github",
  endpoint: "https://api.githubcopilot.com/mcp/",
  credentialStrategy: "user_oauth",
  credentialSubStatus: { label: "not linked", warning: true },
  toolCount: 4,
  state: "connected",
  rowAction: "none",
};

describe("ConnectionsView", () => {
  it("lists backend servers without a policy column", () => {
    renderWithConnectionsPage(<ConnectionsView />, {
      summaries: [githubSummary],
      counts: { total: 1, connected: 1, connecting: 0, failed: 0 },
    });

    expect(
      screen.getByRole("columnheader", { name: "Server" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: "Credential" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: "Tools" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("columnheader", { name: "Policy" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("github")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
  });

  it("shows an authoring empty state instead of a yaml hint", () => {
    renderWithConnectionsPage(<ConnectionsView />, {
      summaries: [],
      counts: { total: 0, connected: 0, connecting: 0, failed: 0 },
    });

    expect(screen.getByText("No connectors yet")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Add connector" }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/torii\.yaml/)).not.toBeInTheDocument();
  });

  it("opens the catalog gallery from Add connector", async () => {
    const user = userEvent.setup();
    renderWithConnectionsPage(<ConnectionsView />, {
      summaries: [githubSummary],
      counts: { total: 1, connected: 1, connecting: 0, failed: 0 },
    });

    await user.click(screen.getByRole("button", { name: "Add connector" }));

    expect(
      screen.getByRole("dialog", { name: "Add connector" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Custom" })).toBeInTheDocument();
  });
});
