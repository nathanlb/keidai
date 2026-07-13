import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ConnectionDetailDrawer } from "../connection-detail-drawer.js";
import {
  createMockLink,
  createMockReconnect,
  renderWithConnectionsPage,
} from "../../test-utils/render-with-connections-page.js";

const githubSummary = {
  name: "github",
  endpoint: "https://api.githubcopilot.com/mcp/",
  credentialStrategy: "user_oauth" as const,
  credentialSubStatus: { label: "not linked", warning: true },
  policySummary: "deny · 2 allowed",
  policyAllowTooltip: "search_issues, get_file_contents",
  toolCount: 2,
  state: "connected" as const,
  rowAction: "link" as const,
  linkProviderId: "github",
};

const githubServer = {
  name: "github",
  transport: { type: "http" as const, url: "https://api.githubcopilot.com/mcp/" },
  credential: { strategy: "user_oauth" as const, provider: "github" },
  policy: { default: "deny" as const, allow: ["search_issues", "get_file_contents"] },
};

vi.mock("../../../shell/hooks/use-fetch-server-tools.js", () => ({
  useFetchServerTools: () => ({
    tools: [
      {
        name: "search_issues",
        description: "Search GitHub issues",
        allowed: true,
      },
      {
        name: "merge_pull_request",
        description: "Merge a pull request",
        allowed: false,
      },
    ],
    isLoading: false,
    error: undefined,
    refresh: vi.fn(),
  }),
}));

describe("ConnectionDetailDrawer", () => {
  it("renders server detail sections when open", () => {
    renderWithConnectionsPage(<ConnectionDetailDrawer />, {
      selectedSummary: githubSummary,
      selectedServer: githubServer,
      drawerOpen: true,
    });

    expect(screen.getByText("github")).toBeInTheDocument();
    expect(screen.getByText("Credential", { exact: true })).toBeInTheDocument();
    expect(screen.getByText("Policy", { exact: true })).toBeInTheDocument();
    expect(screen.getByText("Tools", { exact: true })).toBeInTheDocument();
    expect(screen.getAllByText("Allowed", { exact: true })).toHaveLength(2);
    expect(screen.getAllByText("Blocked", { exact: true })).toHaveLength(2);
    expect(screen.getByText("Search GitHub issues")).toBeInTheDocument();
    expect(screen.getByText("Merge a pull request")).toBeInTheDocument();

    const allowedDescription = screen.getByText("Search GitHub issues");
    const blockedDescription = screen.getByText("Merge a pull request");
    expect(
      allowedDescription.compareDocumentPosition(blockedDescription) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("invokes onLink from the credential callout", async () => {
    const user = userEvent.setup();
    const onLink = createMockLink();

    renderWithConnectionsPage(<ConnectionDetailDrawer />, {
      selectedSummary: githubSummary,
      selectedServer: githubServer,
      drawerOpen: true,
      onLink,
    });

    await user.click(screen.getByRole("button", { name: "Link" }));

    expect(onLink).toHaveBeenCalledWith("github");
  });

  it("invokes onReconnect from the footer", async () => {
    const user = userEvent.setup();
    const onReconnect = createMockReconnect();

    renderWithConnectionsPage(<ConnectionDetailDrawer />, {
      selectedSummary: githubSummary,
      selectedServer: githubServer,
      drawerOpen: true,
      onReconnect,
    });

    await user.click(screen.getByRole("button", { name: "Reconnect" }));

    expect(onReconnect).toHaveBeenCalledWith("github");
  });

  it("renders nothing when no server is selected", () => {
    const { container } = renderWithConnectionsPage(<ConnectionDetailDrawer />, {
      selectedSummary: null,
      drawerOpen: true,
    });

    expect(container).toBeEmptyDOMElement();
  });
});
