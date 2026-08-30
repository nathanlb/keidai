import type { HomeDigest } from "../types/home-digest.js";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";

const actOnAttention = vi.fn();

const digest: HomeDigest = {
  subtitle: "1 thing wants your decision. Everything else is running.",
  attention: [
    {
      id: "appr-1",
      kind: "approval",
      mark: "G",
      tool: "send_email",
      impact: "Sends to team@example.com",
      context: "weekly-newsletter · run-parked · ops-bot",
      parkedLabel: "4m",
      reviewHref: "/approvals?approval=appr-1",
      cta: { type: "approve", approvalId: "appr-1" },
      ctaLabel: "Approve",
    },
  ],
  awaitingYou: 1,
  oldestParkedLabel: "oldest 4m",
  runningCount: 1,
  runningAgentLabel: "1 agent",
  goalMet24h: 2,
  partial24h: 0,
  failed24h: 0,
  failedTaskName: null,
  liveRuns: [
    {
      id: "run-live",
      task: "triage-inbox",
      agent: "ops-bot",
      elapsedLabel: "2m 14s",
      stepText: "Reading 18 unread threads",
      progressPct: 42,
      iterationLabel: "5 / 12",
    },
  ],
  goalRateLabel: "86%",
  week: Array.from({ length: 7 }, (_, index) => ({
    label: "MTWTFSS"[index] ?? "M",
    metPct: 50,
    partialPct: 0,
    missedPct: 10,
  })),
  recentRuns: [
    {
      id: "run-met",
      task: "nightly-digest",
      agent: "researcher",
      verdict: "met",
      durationLabel: "1m 42s",
      whenLabel: "14:02",
    },
  ],
  totalRunCount: 12,
  scheduled: [],
  pausedScheduledCount: 0,
  agents: [
    {
      id: "agt-ops",
      slug: "ops-bot",
      name: "ops-bot",
      initials: "OB",
      summary: "Keeps the ops sheet in order.",
      taskLabel: "2 tasks",
      toolLabel: "9 tools",
      health: "healthy",
    },
  ],
  systemMap: {
    workingCount: 1,
    servers: [
      {
        id: "gmail",
        label: "gmail",
        sub: "11 tools · oauth",
        groupId: "grp-inbox",
      },
    ],
    groups: [
      {
        id: "grp-inbox",
        name: "inbox-ops",
        scope: "17 tools",
        allGated: false,
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
    ],
  },
};

vi.mock("../hooks/use-home-digest.js", () => ({
  useHomeDigest: () => ({
    digest,
    error: undefined,
    isLoading: false,
    refresh: vi.fn(),
    actOnAttention,
  }),
}));

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

import { HomeView } from "../home-view.js";

describe("HomeView", () => {
  it("renders the digest: attention, stats, system map, recent", () => {
    render(
      <MemoryRouter>
        <HomeView />
      </MemoryRouter>,
    );

    expect(
      screen.getByText(
        "1 thing wants your decision. Everything else is running.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByTestId("home-needs-you")).toBeInTheDocument();
    expect(screen.getByText("send_email")).toBeInTheDocument();
    expect(screen.getByTestId("home-stat-awaiting")).toHaveTextContent("1");
    expect(screen.getByTestId("home-system-map")).toBeInTheDocument();
    expect(screen.getByText("1 agent working")).toBeInTheDocument();
    expect(screen.getByText("triage-inbox · step 5 of 12")).toBeInTheDocument();
    expect(screen.queryByText("Running now")).not.toBeInTheDocument();
    expect(screen.queryByText("Your agents")).not.toBeInTheDocument();
    expect(screen.getByText("nightly-digest")).toBeInTheDocument();
    expect(screen.getByTestId("system-map-server-gmail")).toHaveAttribute(
      "href",
      "/connections?server=gmail",
    );
    expect(screen.getByTestId("system-map-agent-agt-ops")).toHaveAttribute(
      "href",
      "/agents/agt-ops",
    );
    expect(screen.getByTestId("system-map-group-grp-inbox")).toHaveAttribute(
      "href",
      "/groups/inbox-ops",
    );
    expect(screen.getByRole("link", { name: /new agent/i })).toHaveAttribute(
      "href",
      "/agents/new",
    );
    expect(screen.getByRole("link", { name: /new task/i })).toHaveAttribute(
      "href",
      "/tasks?new_task=1",
    );
  });

  it("approves a needs-you row without a confirm step", async () => {
    const user = userEvent.setup();
    actOnAttention.mockResolvedValueOnce("Approved — run resumed.");

    render(
      <MemoryRouter>
        <HomeView />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole("button", { name: "Approve" }));
    expect(actOnAttention).toHaveBeenCalledWith({
      type: "approve",
      approvalId: "appr-1",
    });
    expect(
      await screen.findByText("Approved — run resumed."),
    ).toBeInTheDocument();
  });

  it("switches the runs table to the scheduled tab", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <HomeView />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole("button", { name: /scheduled/i }));
    expect(screen.getByText("0 tasks on a trigger")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /all tasks/i })).toHaveAttribute(
      "href",
      "/tasks",
    );
  });
});
