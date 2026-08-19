import type { SavedTask } from "@keidai/shared";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { navigate, runSavedTask } = vi.hoisted(() => ({
  navigate: vi.fn(),
  runSavedTask: vi.fn(),
}));

const taskA: SavedTask = {
  id: "task-a",
  goal: "Compose weekly status report",
  trigger: { type: "now" },
  assignee: "agent-1",
  createdAt: "2026-07-13T12:00:00.000Z",
  updatedAt: "2026-07-13T12:00:00.000Z",
};

const taskB: SavedTask = {
  id: "task-b",
  goal: "Draft the release notes",
  trigger: { type: "now" },
  assignee: "agent-1",
  createdAt: "2026-07-13T12:05:00.000Z",
  updatedAt: "2026-07-13T12:05:00.000Z",
};

vi.mock("../../api/shaiden-client.js", () => ({
  runSavedTask,
}));

vi.mock("../../hooks/use-fetch-tasks.js", () => ({
  useFetchTasks: () => ({
    data: {
      tasks: [
        {
          id: "task-a",
          goal: "Compose weekly status report",
          trigger: { type: "now" },
          assignee: "agent-1",
          createdAt: "2026-07-13T12:00:00.000Z",
          updatedAt: "2026-07-13T12:00:00.000Z",
        },
        {
          id: "task-b",
          goal: "Draft the release notes",
          trigger: { type: "now" },
          assignee: "agent-1",
          createdAt: "2026-07-13T12:05:00.000Z",
          updatedAt: "2026-07-13T12:05:00.000Z",
        },
      ],
    },
    error: undefined,
    isLoading: false,
    refresh: vi.fn(),
  }),
}));

vi.mock("../../hooks/use-runs-visibility.js", () => ({
  useRunsVisibility: () => ({
    runs: [
      {
        id: "run-a",
        taskId: "task-a",
        startedAt: "2026-07-13T12:10:00.000Z",
        assignee: "agent-1",
        goalPreview: "Compose weekly status report",
        status: "running",
        stepCount: 0,
        assigneeDisplay: null,
      },
    ],
    error: undefined,
    isLoading: false,
  }),
}));

vi.mock("../task-authoring-dialog.js", () => ({
  TaskAuthoringDialog: () => null,
}));

vi.mock("react-router", async () => {
  const actual =
    await vi.importActual<typeof import("react-router")>("react-router");
  return {
    ...actual,
    useNavigate: () => navigate,
  };
});

import { TasksListView } from "../tasks-list-view.js";

function runButtonForGoal(goal: string): HTMLElement {
  const row = screen.getByRole("row", { name: new RegExp(goal) });
  return within(row).getByRole("button", { name: "Run" });
}

function renderList() {
  return render(
    <MemoryRouter>
      <TasksListView />
    </MemoryRouter>,
  );
}

describe("TasksListView concurrent runs", () => {
  beforeEach(() => {
    navigate.mockReset();
    runSavedTask.mockReset();
    runSavedTask.mockResolvedValue({ runId: "run-b", taskId: taskB.id });
  });

  it("disables Run only on a task that already has a running run", () => {
    renderList();

    expect(runButtonForGoal(taskA.goal)).toBeDisabled();
    expect(runButtonForGoal(taskB.goal)).toBeEnabled();
  });

  it("keeps the in-flight task's sibling disabled from live runs while starting another", async () => {
    const user = userEvent.setup();
    let resolveStart!: (value: { runId: string; taskId: string }) => void;
    runSavedTask.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveStart = resolve;
        }),
    );

    renderList();

    await user.click(runButtonForGoal(taskB.goal));

    expect(runButtonForGoal(taskA.goal)).toBeDisabled();
    expect(runButtonForGoal(taskB.goal)).toBeDisabled();
    expect(runSavedTask).toHaveBeenCalledWith(taskB.id);

    resolveStart({ runId: "run-b", taskId: taskB.id });
    await vi.waitFor(() => {
      expect(navigate).toHaveBeenCalledWith("/shaiden/runs?run=run-b");
    });
  });
});
