import type { RunReport } from "@keidai/shared";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { RunDetailDrawer } from "../run-detail-drawer.js";

vi.mock("../../api/shaiden-client.js", () => ({
  sendRunFollowUp: vi.fn().mockResolvedValue({ runId: "run-1" }),
}));

import { sendRunFollowUp } from "../../api/shaiden-client.js";

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

function renderRunDetailDrawer(run: RunReport) {
  return render(
    <MemoryRouter>
      <RunDetailDrawer
        run={run}
        open
        onOpenChange={vi.fn()}
        onRunUpdated={vi.fn()}
      />
    </MemoryRouter>,
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
});
