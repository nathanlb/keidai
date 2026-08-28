import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ConnectionDetailDrawer } from "../connection-detail-drawer.js";
import {
  createMockLink,
  createMockReconnect,
  renderWithConnectionsPage,
} from "../test-utils/render-with-connections-page.js";

const githubSummary = {
  name: "github",
  endpoint: "https://api.githubcopilot.com/mcp/",
  credentialStrategy: "user_oauth" as const,
  credentialSubStatus: { label: "not linked", warning: true },
  toolCount: 2,
  state: "connected" as const,
  rowAction: "link" as const,
  linkProviderId: "github",
};

const githubServer = {
  name: "github",
  transport: {
    type: "http" as const,
    url: "https://api.githubcopilot.com/mcp/",
  },
  credential: { strategy: "user_oauth" as const, provider: "github" },
  policy: {
    default: "deny" as const,
    allow: ["search_issues", "get_file_contents"],
  },
};

vi.mock("../../lib/hooks/use-fetch-server-tools.js", () => ({
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

    expect(screen.getByRole("heading", { name: "github" })).toBeInTheDocument();
    expect(screen.getByText("Credential", { exact: true })).toBeInTheDocument();
    expect(
      screen.queryByText("Policy", { exact: true }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Tools", { exact: true })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove" })).toBeInTheDocument();
    expect(screen.queryByText("Allowed")).not.toBeInTheDocument();
    expect(screen.queryByText("Blocked")).not.toBeInTheDocument();
    expect(screen.getByText("Search GitHub issues")).toBeInTheDocument();
    expect(screen.getByText("Merge a pull request")).toBeInTheDocument();

    const mergeDescription = screen.getByText("Merge a pull request");
    const searchDescription = screen.getByText("Search GitHub issues");
    expect(
      mergeDescription.compareDocumentPosition(searchDescription) &
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

  it("does not prompt for BYO client credentials on a discovered catalog connector", () => {
    renderWithConnectionsPage(<ConnectionDetailDrawer />, {
      selectedSummary: {
        ...githubSummary,
        name: "notion",
        endpoint: "https://mcp.notion.com/mcp",
        linkProviderId: "notion",
      },
      selectedServer: {
        ...githubServer,
        name: "notion",
        transport: { type: "http", url: "https://mcp.notion.com/mcp" },
        credential: { strategy: "user_oauth", provider: "notion" },
      },
      selectedConnector: {
        slug: "notion",
        displayName: "Notion",
        url: "https://mcp.notion.com/mcp",
        transportType: "http",
        authMode: "user_oauth",
        enabled: true,
        catalogId: "notion",
        catalogVersion: "1",
        createdAt: new Date(0).toISOString(),
        updatedAt: new Date(0).toISOString(),
      },
      drawerOpen: true,
    });

    expect(
      screen.queryByText(/Paste BYO OAuth client credentials/),
    ).not.toBeInTheDocument();
  });

  it("prompts for BYO client credentials on a Class B connector without a stored client", () => {
    renderWithConnectionsPage(<ConnectionDetailDrawer />, {
      selectedSummary: githubSummary,
      selectedServer: githubServer,
      selectedConnector: {
        slug: "github",
        displayName: "GitHub",
        url: "https://api.githubcopilot.com/mcp/",
        transportType: "http",
        authMode: "user_oauth",
        enabled: true,
        catalogId: "github",
        catalogVersion: "1",
        createdAt: new Date(0).toISOString(),
        updatedAt: new Date(0).toISOString(),
      },
      drawerOpen: true,
    });

    expect(
      screen.getByText(/Paste BYO OAuth client credentials/),
    ).toBeInTheDocument();
  });

  it("renders nothing when no server is selected", () => {
    const { container } = renderWithConnectionsPage(
      <ConnectionDetailDrawer />,
      {
        selectedSummary: null,
        drawerOpen: true,
      },
    );

    expect(container).toBeEmptyDOMElement();
  });
});
