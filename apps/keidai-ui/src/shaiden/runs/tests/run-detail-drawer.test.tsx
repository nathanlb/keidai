import type { RunReport } from "@keidai/shared";
import { TooltipProvider } from "@keidai/ui";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { RunDetailDrawer } from "../run-detail-drawer.js";

vi.mock("../../api/shaiden-client.js", () => ({
  sendRunFollowUp: vi.fn().mockResolvedValue({ runId: "run-1" }),
  stopRun: vi.fn().mockResolvedValue({ runId: "run-1" }),
  resumeRun: vi.fn().mockResolvedValue({ runId: "run-1" }),
}));

import {
  resumeRun,
  sendRunFollowUp,
  stopRun,
} from "../../api/shaiden-client.js";

const baseRun: RunReport = {
  id: "run-1",
  taskId: "task-1",
  task: {
    goal: "Compose weekly status report",
    trigger: { type: "now" },
    assignee: "agent-1",
  },
  startedAt: "2026-07-14T12:00:00.000Z",
  assignee: "agent-1",
  goalPreview: "Compose weekly status report",
  status: "running",
  stepCount: 1,
  steps: [
    {
      id: "step-1",
      timestamp: "2026-07-14T12:00:01.000Z",
      kind: "model",
      text: "Planning next action",
    },
  ],
};

function renderRunDetailDrawer(
  run: RunReport,
  assigneeDisplay?: {
    id: string;
    name: string;
    slug: string;
    displayName: string;
    initials: string;
  } | null,
) {
  return render(
    <TooltipProvider>
      <MemoryRouter>
        <RunDetailDrawer
          run={run}
          assigneeDisplay={assigneeDisplay}
          open
          onOpenChange={vi.fn()}
          onRunUpdated={vi.fn()}
        />
      </MemoryRouter>
    </TooltipProvider>,
  );
}

function runLogLoader(): HTMLElement | null {
  return screen.queryByText("Running…");
}

describe("RunDetailDrawer run log loader", () => {
  it("shows a spinner tail while the run is actively executing", () => {
    renderRunDetailDrawer(baseRun);

    const loader = runLogLoader();
    expect(loader).toBeInTheDocument();
    expect(loader).toHaveAttribute("aria-live", "polite");
    expect(loader?.querySelector(".animate-spin")).toBeInTheDocument();
  });

  it("shows assignee display name in the header when provided", () => {
    renderRunDetailDrawer(baseRun, {
      id: "agent-1",
      name: "Weekly Reporter",
      slug: "weekly-reporter",
      displayName: "Weekly Reporter",
      initials: "WR",
    });

    expect(screen.getByText(/Weekly Reporter/)).toBeInTheDocument();
    expect(screen.queryByText(/agent-1/)).not.toBeInTheDocument();
  });

  it("labels output steps distinctly from reasoning", () => {
    renderRunDetailDrawer({
      ...baseRun,
      status: "completed",
      outcome: { status: "goal_met" },
      steps: [
        {
          id: "step-1",
          timestamp: "2026-07-14T12:00:01.000Z",
          kind: "model",
          text: "Planning next action",
        },
        {
          id: "step-2",
          timestamp: "2026-07-14T12:00:02.000Z",
          kind: "output",
          text: "Final answer for the operator",
        },
        {
          id: "step-3",
          timestamp: "2026-07-14T12:00:03.000Z",
          kind: "outcome",
          outcomeStatus: "goal_met",
        },
      ],
    });

    expect(screen.getByText("Reasoning")).toBeInTheDocument();
    expect(screen.getByText("Output")).toBeInTheDocument();
    expect(
      screen.getByText("Final answer for the operator"),
    ).toBeInTheDocument();
  });

  it("groups a tool call and its result into one run-log row", () => {
    renderRunDetailDrawer({
      ...baseRun,
      status: "completed",
      outcome: { status: "goal_met" },
      steps: [
        {
          id: "step-1",
          timestamp: "2026-07-14T12:00:01.000Z",
          kind: "model",
          text: "Planning next action",
        },
        {
          id: "step-2",
          timestamp: "2026-07-14T12:00:02.000Z",
          kind: "tool_dispatch",
          toolName: "linear.list_projects",
          toolCallId: "call-1",
          inputPreview: '{"limit":50}',
        },
        {
          id: "step-3",
          timestamp: "2026-07-14T12:00:03.000Z",
          kind: "tool_result",
          toolName: "linear.list_projects",
          toolCallId: "call-1",
          status: "ok",
          outputPreview: '{"projects":[]}',
          charCount: 16,
          traceId: "trace-1",
        },
      ],
    });

    expect(
      screen.getByText("Tool call · linear.list_projects"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Tool result · linear.list_projects"),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Result · 16 chars")).toBeInTheDocument();
    expect(screen.getByText("ok")).toBeInTheDocument();
    expect(screen.getByText("1.0s")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /view trace in torii/i }),
    ).toHaveAttribute("href", "/activity?trace_id=trace-1");
  });

  it("shows a running affordance for an in-flight tool call", () => {
    renderRunDetailDrawer({
      ...baseRun,
      steps: [
        {
          id: "step-1",
          timestamp: "2026-07-14T12:00:01.000Z",
          kind: "tool_dispatch",
          toolName: "linear.list_initiatives",
          toolCallId: "call-1",
          inputPreview: '{"limit":50}',
        },
      ],
    });

    expect(screen.getByText("running")).toBeInTheDocument();
    expect(
      screen.queryByText("Tool result · linear.list_initiatives"),
    ).not.toBeInTheDocument();
  });

  it("shows orphaned tool results as standalone rows", () => {
    renderRunDetailDrawer({
      ...baseRun,
      status: "completed",
      outcome: { status: "goal_met" },
      steps: [
        {
          id: "step-1",
          timestamp: "2026-07-14T12:00:01.000Z",
          kind: "tool_result",
          toolName: "linear.list_projects",
          toolCallId: "orphan-1",
          status: "ok",
          outputPreview: '{"projects":[]}',
        },
      ],
    });

    expect(
      screen.getByText("Tool result · linear.list_projects"),
    ).toBeInTheDocument();
  });

  it("hides the spinner when the run is waiting for approval", () => {
    renderRunDetailDrawer({
      ...baseRun,
      steps: [
        ...baseRun.steps,
        {
          id: "step-2",
          timestamp: "2026-07-14T12:00:02.000Z",
          kind: "waiting_approval",
          toolName: "gmail.create_draft",
          approvalId: "approval-1",
        },
      ],
    });

    expect(runLogLoader()).not.toBeInTheDocument();
    expect(screen.getByText("Awaiting human review")).toBeInTheDocument();
  });

  it("hides the spinner when the run has reached a terminal outcome", () => {
    renderRunDetailDrawer({
      ...baseRun,
      status: "completed",
      outcome: { status: "goal_met" },
    });

    expect(runLogLoader()).not.toBeInTheDocument();
  });

  it("shows a follow-up composer on terminal and waiting_approval runs", () => {
    renderRunDetailDrawer({
      ...baseRun,
      status: "completed",
      outcome: { status: "failed", reason: "tool error" },
    });
    expect(screen.getByText("Follow-up")).toBeInTheDocument();

    renderRunDetailDrawer({
      ...baseRun,
      steps: [
        ...baseRun.steps,
        {
          id: "step-2",
          timestamp: "2026-07-14T12:00:02.000Z",
          kind: "waiting_approval",
          toolName: "gmail.create_draft",
          approvalId: "approval-1",
        },
      ],
    });
    expect(screen.getAllByText("Follow-up").length).toBeGreaterThan(0);
  });

  it("hides the follow-up composer while actively running", () => {
    renderRunDetailDrawer(baseRun);
    expect(screen.queryByText("Follow-up message")).not.toBeInTheDocument();
  });

  it("submits a follow-up message", async () => {
    const user = userEvent.setup();
    const onRunUpdated = vi.fn();
    render(
      <MemoryRouter>
        <RunDetailDrawer
          run={{
            ...baseRun,
            status: "completed",
            outcome: { status: "goal_met" },
          }}
          open
          onOpenChange={vi.fn()}
          onRunUpdated={onRunUpdated}
        />
      </MemoryRouter>,
    );

    await user.type(
      screen.getByPlaceholderText(/add guidance/i),
      "Summarize what you did",
    );
    await user.click(screen.getByRole("button", { name: /send follow-up/i }));

    expect(sendRunFollowUp).toHaveBeenCalledWith(
      "run-1",
      "Summarize what you did",
    );
    expect(onRunUpdated).toHaveBeenCalled();
  });

  it("clears composer state when switching runs", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <MemoryRouter>
        <RunDetailDrawer
          run={{
            ...baseRun,
            id: "run-1",
            status: "completed",
            outcome: { status: "goal_met" },
          }}
          open
          onOpenChange={vi.fn()}
          onRunUpdated={vi.fn()}
        />
      </MemoryRouter>,
    );

    await user.type(
      screen.getByPlaceholderText(/add guidance/i),
      "Draft for run one",
    );

    rerender(
      <MemoryRouter>
        <RunDetailDrawer
          run={{
            ...baseRun,
            id: "run-2",
            status: "completed",
            outcome: { status: "goal_met" },
          }}
          open
          onOpenChange={vi.fn()}
          onRunUpdated={vi.fn()}
        />
      </MemoryRouter>,
    );

    expect(screen.getByPlaceholderText(/add guidance/i)).toHaveValue("");
  });

  it("stops a running run from the drawer", async () => {
    const user = userEvent.setup();
    const onRunUpdated = vi.fn();
    render(
      <TooltipProvider>
        <MemoryRouter>
          <RunDetailDrawer
            run={baseRun}
            open
            onOpenChange={vi.fn()}
            onRunUpdated={onRunUpdated}
          />
        </MemoryRouter>
      </TooltipProvider>,
    );

    await user.click(screen.getByRole("button", { name: /^stop$/i }));

    expect(stopRun).toHaveBeenCalledWith("run-1");
    expect(onRunUpdated).toHaveBeenCalled();
  });

  it("disables stop while waiting for approval", () => {
    renderRunDetailDrawer({
      ...baseRun,
      steps: [
        ...baseRun.steps,
        {
          id: "step-2",
          timestamp: "2026-07-14T12:00:02.000Z",
          kind: "waiting_approval",
          toolName: "gmail.create_draft",
          approvalId: "approval-1",
        },
      ],
    });

    expect(screen.getByRole("button", { name: /^stop$/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /approve/i })).toBeEnabled();
  });

  it("resumes a stopped run from the drawer", async () => {
    const user = userEvent.setup();
    const onRunUpdated = vi.fn();
    render(
      <TooltipProvider>
        <MemoryRouter>
          <RunDetailDrawer
            run={{
              ...baseRun,
              status: "completed",
              outcome: { status: "stopped" },
            }}
            open
            onOpenChange={vi.fn()}
            onRunUpdated={onRunUpdated}
          />
        </MemoryRouter>
      </TooltipProvider>,
    );

    expect(screen.getByText("Stopped")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^resume$/i }));

    expect(resumeRun).toHaveBeenCalledWith("run-1");
    expect(onRunUpdated).toHaveBeenCalled();
    expect(screen.getByText("Follow-up")).toBeInTheDocument();
  });
});
