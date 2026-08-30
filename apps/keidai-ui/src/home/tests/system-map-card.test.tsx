import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { SystemMapCard } from "../components/system-map-card.js";
import type { HomeSystemMap } from "../types/home-digest.js";

vi.mock("../../lib/hooks/use-ecosystem-health.js", () => ({
  useEcosystemHealth: () => ({
    torii: {
      healthy: true,
      label: "Healthy",
      displayAddress: "",
      version: "0.3.0",
    },
    fuda: {
      healthy: true,
      label: "Healthy",
      displayAddress: "",
      version: "0.3.0",
    },
    shaiden: {
      healthy: true,
      label: "Healthy",
      displayAddress: "",
      version: "0.3.0",
    },
    version: "v0.3.0",
  }),
}));

const typical: HomeSystemMap = {
  workingCount: 1,
  servers: [
    {
      id: "gmail",
      label: "gmail",
      sub: "11 tools · oauth",
      groupId: "grp-inbox",
    },
    {
      id: "stripe",
      label: "stripe",
      sub: "4 tools · gated",
      groupId: "grp-billing",
    },
  ],
  groups: [
    {
      id: "grp-inbox",
      name: "inbox-ops",
      scope: "17 tools",
      allGated: false,
    },
    {
      id: "grp-billing",
      name: "billing-write",
      scope: "4 tools, all gated",
      allGated: true,
    },
  ],
  agents: [
    {
      id: "agt-ops",
      label: "ops-bot",
      groupId: "grp-inbox",
      state: "working",
      task: "triage-inbox · step 5 of 12",
      meta: "2m 14s",
    },
    {
      id: "agt-bill",
      label: "invoicer",
      groupId: "grp-billing",
      state: "waiting",
      task: "monthly-invoices · 1 approval parked",
      meta: "1h 20m",
    },
  ],
};

describe("SystemMapCard", () => {
  it("links every node to its record and activity to the gateway stream", () => {
    render(
      <MemoryRouter>
        <SystemMapCard map={typical} />
      </MemoryRouter>,
    );

    expect(screen.getByTestId("system-map-server-gmail")).toHaveAttribute(
      "href",
      "/connections?server=gmail",
    );
    expect(screen.getByTestId("system-map-group-grp-inbox")).toHaveAttribute(
      "href",
      "/groups/inbox-ops",
    );
    expect(screen.getByTestId("system-map-agent-agt-ops")).toHaveAttribute(
      "href",
      "/agents/agt-ops",
    );
    expect(
      screen.getByRole("link", { name: "Gateway activity →" }),
    ).toHaveAttribute("href", "/activity");
    expect(screen.getByTestId("system-map-fuda")).toHaveTextContent("fuda");
    expect(screen.getByTestId("system-map-health-torii")).toHaveAttribute(
      "aria-label",
      "torii, Healthy",
    );
    expect(screen.getByTestId("system-map-health-shaiden")).toHaveAttribute(
      "aria-label",
      "shaiden, Healthy",
    );
    expect(screen.getByTestId("system-map-health-fuda")).toHaveAttribute(
      "aria-label",
      "fuda, Healthy",
    );
  });

  it("teaches the empty install with next-action ghosts", () => {
    render(
      <MemoryRouter>
        <SystemMapCard
          map={{ servers: [], groups: [], agents: [], workingCount: 0 }}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText("nothing running")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Connect a server" }),
    ).toHaveAttribute("href", "/connections");
    expect(screen.getByRole("link", { name: "Add a group" })).toHaveAttribute(
      "href",
      "/groups/new",
    );
    expect(screen.getByRole("link", { name: "Add an agent" })).toHaveAttribute(
      "href",
      "/agents/new",
    );
  });
});
