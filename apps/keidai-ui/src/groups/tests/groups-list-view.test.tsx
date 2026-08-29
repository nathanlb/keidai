import type { GroupView } from "@keidai/shared";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";

const { navigate } = vi.hoisted(() => ({ navigate: vi.fn() }));

const opsWrite: GroupView = {
  id: "grp-1",
  name: "ops-write",
  description: "Day-to-day write access",
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
  servers: [
    {
      server: "gmail",
      default: "deny",
      allow: ["messages.list"],
      deny: [],
      gated: ["messages.send"],
    },
  ],
};

vi.mock("../hooks/use-fetch-groups.js", () => ({
  useFetchGroups: () => ({
    data: { groups: [opsWrite] },
    error: undefined,
    isLoading: false,
    refresh: vi.fn(),
  }),
}));

vi.mock("../../lib/hooks/use-fetch-agents.js", () => ({
  useFetchAgents: () => ({
    data: {
      agents: [
        {
          id: "agt-1",
          slug: "ops-bot",
          name: "ops-bot",
          ownerId: "owner",
          groups: ["ops-write", "finance-write"],
          persona: "p",
          currentPersonaVersion: 1,
          createdAt: "2026-08-01T00:00:00.000Z",
          updatedAt: "2026-08-01T00:00:00.000Z",
        },
        {
          id: "agt-2",
          slug: "invoicer",
          name: "invoicer",
          ownerId: "owner",
          groups: ["finance-write"],
          persona: "p",
          currentPersonaVersion: 1,
          createdAt: "2026-08-01T00:00:00.000Z",
          updatedAt: "2026-08-01T00:00:00.000Z",
        },
      ],
    },
    error: undefined,
    isLoading: false,
    refresh: vi.fn(),
  }),
}));

vi.mock("../hooks/use-fetch-server-catalogues.js", () => ({
  useFetchServerCatalogues: () => ({
    catalogues: {
      gmail: {
        available: true,
        tools: [
          { name: "messages.send", description: "Send" },
          { name: "messages.list", description: "List" },
          { name: "messages.get", description: "Get" },
        ],
      },
    },
    error: undefined,
    isLoading: false,
    refresh: vi.fn(),
  }),
}));

vi.mock("react-router", async () => {
  const actual =
    await vi.importActual<typeof import("react-router")>("react-router");
  return { ...actual, useNavigate: () => navigate };
});

import { GroupsListView } from "../groups-list-view.js";

describe("GroupsListView", () => {
  it("lists groups, grants, and the undefined-groups banner", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <GroupsListView />
      </MemoryRouter>,
    );

    expect(screen.getByText("ops-write")).toBeInTheDocument();
    expect(screen.getByText("gmail")).toBeInTheDocument();
    expect(screen.getByText("2 of 3 tools")).toBeInTheDocument();
    expect(screen.getByText("1 need approval")).toBeInTheDocument();
    expect(
      screen.getByText("1 group is referenced but not defined"),
    ).toBeInTheDocument();
    expect(screen.getByText(/finance-write/)).toBeInTheDocument();

    await user.click(screen.getByText("ops-write"));
    expect(navigate).toHaveBeenCalledWith("/groups/ops-write");
  });
});
