import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ConnectionsView } from "../connections-view.js";
import { renderWithConnectionsPage } from "../test-utils/render-with-connections-page.js";

vi.mock("../../shell/hooks/use-acting-owner.js", () => ({
  useActingOwner: () => ({
    owner: {
      ownerId: "ada",
      displayName: "Ada",
      initials: "A",
      role: "member",
    },
    isAdmin: false,
    isLoading: false,
  }),
}));

vi.mock("../../lib/hooks/use-fetch-connector-catalog.js", () => ({
  useFetchConnectorCatalog: () => ({
    data: { catalog: [], version: "1" },
    isLoading: false,
    error: undefined,
    refresh: vi.fn(),
  }),
}));

describe("ConnectionsView member access", () => {
  it("hides connector creation for members", () => {
    renderWithConnectionsPage(<ConnectionsView />, {
      summaries: [],
      counts: { total: 0, connected: 0, connecting: 0, failed: 0 },
    });

    expect(screen.getByText("No connectors yet")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Add connector" }),
    ).not.toBeInTheDocument();
  });
});
