import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsView } from "../settings-view.js";

vi.mock("../../shell/hooks/use-acting-owner.js", () => ({
  useActingOwner: vi.fn(),
}));

vi.mock("../../lib/api/openrouter.js", () => ({
  fetchOpenRouterCredential: vi.fn(async () => ({
    configured: false,
    hint: null,
    source: "none",
  })),
  saveOpenRouterCredential: vi.fn(),
  clearOpenRouterCredential: vi.fn(),
}));

vi.mock("../../lib/api/owners.js", async () => {
  const actual = await vi.importActual<
    typeof import("../../lib/api/owners.js")
  >("../../lib/api/owners.js");
  return {
    ...actual,
    fetchOwners: vi.fn(async () => ({
      owners: [
        {
          ownerId: "ada",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
          status: "active",
          role: "admin",
          email: "ada@example.com",
          displayName: "Ada Lovelace",
          pictureUrl: null,
        },
        {
          ownerId: "bob",
          createdAt: "2026-01-02T00:00:00.000Z",
          updatedAt: "2026-01-02T00:00:00.000Z",
          status: "active",
          role: "member",
          email: "bob@example.com",
          displayName: "Bob",
          pictureUrl: null,
        },
      ],
    })),
    updateOwner: vi.fn(),
    deleteOwner: vi.fn(),
  };
});

import { useActingOwner } from "../../shell/hooks/use-acting-owner.js";

const adminOwner = {
  ownerId: "ada",
  displayName: "Ada Lovelace",
  initials: "AL",
  role: "admin" as const,
};

describe("SettingsView", () => {
  beforeEach(() => {
    vi.mocked(useActingOwner).mockReturnValue({
      owner: adminOwner,
      isAdmin: true,
      isLoading: false,
    });
  });

  it("shows the API key and operator roster to admins", async () => {
    render(<SettingsView />);

    expect(
      await screen.findByRole("heading", { name: "OpenRouter API key" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Operators & roles")).toBeInTheDocument();
    expect(await screen.findByText("Ada Lovelace")).toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: "Role for Ada Lovelace" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Remove Ada Lovelace" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("combobox", { name: "Role for Bob" }),
    ).toBeEnabled();
  });

  it("shows a read-only notice to members", () => {
    vi.mocked(useActingOwner).mockReturnValue({
      owner: { ...adminOwner, ownerId: "bob", role: "member" },
      isAdmin: false,
      isLoading: false,
    });

    render(<SettingsView />);

    expect(
      screen.getByText("Workspace settings are read-only"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "OpenRouter API key" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Operators & roles")).not.toBeInTheDocument();
  });
});
