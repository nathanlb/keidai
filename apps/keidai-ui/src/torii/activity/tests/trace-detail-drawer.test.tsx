import { PolicyDecision } from "@keidai/shared";
import type { TraceListItem } from "@keidai/shared";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TraceDetailDrawer } from "../trace-detail-drawer.js";
import { githubServer } from "../utils/tests/trace-detail-fixtures.js";

const deniedTrace: TraceListItem = {
  traceId: "trace-denied",
  timestamp: "2026-06-23T14:32:30.000Z",
  server: "github",
  tool: "delete_repo",
  principal: { agentId: "demo-agent", ownerId: "nathanlb" },
  policyDecision: PolicyDecision.Denied,
  error: "policy denied",
  outcome: "denied",
};

const linkingTrace: TraceListItem = {
  traceId: "trace-linking",
  timestamp: "2026-06-23T14:32:49.000Z",
  server: "github",
  tool: "search_issues",
  principal: { agentId: "triage-bot", ownerId: "nathanlb" },
  credentialRef: "github:nathanlb",
  policyDecision: PolicyDecision.Allowed,
  error:
    'OAuth connection required for provider "github" (backend "github")',
  outcome: "linking_required",
};

describe("TraceDetailDrawer", () => {
  it("renders denied trace sections when open", () => {
    render(
      <TraceDetailDrawer
        trace={deniedTrace}
        server={githubServer}
        open
        onOpenChange={() => {}}
      />,
    );

    expect(screen.getByText("delete_repo")).toBeInTheDocument();
    expect(screen.getByText("trace-denied")).toBeInTheDocument();
    expect(screen.getByText("Denied by policy")).toBeInTheDocument();
    expect(screen.getByText("Trace timeline", { exact: true })).toBeInTheDocument();
    expect(
      screen.getByText("Credential resolution", { exact: true }),
    ).toBeInTheDocument();
  });

  it("invokes onLinkProvider for linking_required traces", async () => {
    const user = userEvent.setup();
    const onLinkProvider = vi.fn();

    render(
      <TraceDetailDrawer
        trace={linkingTrace}
        server={githubServer}
        open
        onOpenChange={() => {}}
        onLinkProvider={onLinkProvider}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Link" }));

    expect(onLinkProvider).toHaveBeenCalledWith("github", "nathanlb");
  });

  it("renders nothing when trace is null", () => {
    const { container } = render(
      <TraceDetailDrawer trace={null} open onOpenChange={() => {}} />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
