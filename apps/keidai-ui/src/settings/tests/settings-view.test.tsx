import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppProvider } from "../../shell/context/app-provider.js";
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

function renderSettings() {
  return render(
    <AppProvider>
      <SettingsView />
    </AppProvider>,
  );
}

describe("SettingsView", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove("theme-platinum", "dark");
    vi.mocked(useActingOwner).mockReturnValue({
      owner: adminOwner,
      isAdmin: true,
      isLoading: false,
    });
  });

  it("shows the API key and operator roster to admins", async () => {
    renderSettings();

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

  it("switches between the Default and Platinum themes", () => {
    renderSettings();

    const platinum = screen.getByRole("radio", { name: "Platinum" });
    const defaultOption = screen.getByRole("radio", { name: "Default" });

    expect(defaultOption).toHaveAttribute("data-state", "on");
    expect(document.documentElement.classList.contains("theme-platinum")).toBe(
      false,
    );

    fireEvent.click(platinum);
    expect(platinum).toHaveAttribute("data-state", "on");
    expect(document.documentElement.classList.contains("theme-platinum")).toBe(
      true,
    );
    expect(localStorage.getItem("keidai-ui-theme-palette")).toBe("platinum");

    fireEvent.click(defaultOption);
    expect(defaultOption).toHaveAttribute("data-state", "on");
    expect(document.documentElement.classList.contains("theme-platinum")).toBe(
      false,
    );
    expect(localStorage.getItem("keidai-ui-theme-palette")).toBe("default");
  });

  it("shows a read-only notice to members while keeping theme settings available", () => {
    vi.mocked(useActingOwner).mockReturnValue({
      owner: { ...adminOwner, ownerId: "bob", role: "member" },
      isAdmin: false,
      isLoading: false,
    });

    renderSettings();

    expect(screen.getByRole("radio", { name: "Platinum" })).toBeInTheDocument();
    expect(
      screen.getByText("Workspace settings are read-only"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "OpenRouter API key" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Operators & roles")).not.toBeInTheDocument();
  });
});
