import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ConnectionsView } from "../connections-view.js";
import { renderWithConnectionsPage } from "../test-utils/render-with-connections-page.js";
import type { ServerConnectionSummary } from "../utils/build-server-summaries.js";

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
});
