import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { SavedTask } from "@keidai/shared";
import type { ManagementAgent } from "../../lib/api/agents.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as shaidenClient from "../../lib/api/tasks.js";
import { TaskAuthoringView } from "../task-authoring-view.js";

const shaidenAgent: ManagementAgent = {
  id: "shaiden-newsletter-01",
  slug: "shaiden",
  name: "Newsletter Writer",
  ownerId: "nathanlb",
  groups: [],
  persona: "You draft the weekly engineering newsletter.",
  currentPersonaVersion: 1,
  createdAt: "2026-06-02T00:00:00.000Z",
  updatedAt: "2026-06-02T00:00:00.000Z",
};

const savedTask: SavedTask = {
  id: "task-saved-1",
  goal: "Compose weekly status report",
  trigger: { type: "now" },
  assignee: shaidenAgent.id,
  createdAt: "2026-07-13T12:00:00.000Z",
  updatedAt: "2026-07-13T12:00:00.000Z",
};

const { navigate } = vi.hoisted(() => ({
  navigate: vi.fn(),
}));

vi.mock("../../lib/api/tasks.js", () => ({
  fetchTask: vi.fn(),
  updateTask: vi.fn(),
  archiveTask: vi.fn(),
  startTaskRun: vi.fn(),
  createTask: vi.fn(),
}));

vi.mock("../hooks/use-fetch-task-runtime.js", () => ({
  useFetchTaskRuntime: () => ({
    data: { ready: true },
    error: undefined,
    isLoading: false,
  }),
}));

vi.mock("../../lib/hooks/use-fetch-agents.js", () => ({
  useFetchAgents: () => ({
    data: { agents: [shaidenAgent] },
    error: undefined,
    isLoading: false,
  }),
}));

vi.mock("../../shell/hooks/use-acting-owner.js", () => ({
  useActingOwner: () => ({
    owner: {
      ownerId: "nathanlb",
      displayName: "nathanlb",
      initials: "NL",
    },
    isLoading: false,
  }),
}));

vi.mock("react-router", async () => {
  const actual =
    await vi.importActual<typeof import("react-router")>("react-router");
  return {
    ...actual,
    useNavigate: () => navigate,
  };
});

function renderEditView() {
  render(<TaskAuthoringView taskId={savedTask.id} />);
}

function renderCreateView() {
  render(<TaskAuthoringView />);
}

async function waitForGoalInput() {
  const input = await screen.findByPlaceholderText(
    /describe what "done" looks like/i,
  );
  await waitFor(() => {
    expect(input).toHaveValue(savedTask.goal);
  });
  return input;
}

describe("TaskAuthoringView edit mode", () => {
  beforeEach(() => {
    navigate.mockReset();
    vi.mocked(shaidenClient.fetchTask).mockResolvedValue({ task: savedTask });
    vi.mocked(shaidenClient.updateTask).mockResolvedValue({
      task: {
        ...savedTask,
        goal: "Compose monthly status report",
        updatedAt: "2026-07-14T12:00:00.000Z",
      },
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("disables save when the loaded task has not changed", async () => {
    renderEditView();
    await waitForGoalInput();

    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
  });

  it("enables save after the goal changes", async () => {
    const user = userEvent.setup();
    renderEditView();
    const goalInput = await waitForGoalInput();

    await user.clear(goalInput);
    await user.type(goalInput, "Compose monthly status report");

    expect(screen.getByRole("button", { name: "Save changes" })).toBeEnabled();
  });

  it("leaves without confirmation when canceling a clean form", async () => {
    const user = userEvent.setup();
    renderEditView();
    await waitForGoalInput();

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(
      screen.queryByRole("dialog", { name: "Discard changes?" }),
    ).not.toBeInTheDocument();
    expect(navigate).toHaveBeenCalledWith("/tasks");
  });

  it("prompts before discarding dirty edits", async () => {
    const user = userEvent.setup();
    renderEditView();
    const goalInput = await waitForGoalInput();

    await user.type(goalInput, " with edits");
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(
      screen.getByRole("dialog", { name: "Discard changes?" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Edit task")).toBeInTheDocument();
    expect(navigate).not.toHaveBeenCalled();
  });

  it("returns to the edit form when keep editing is chosen", async () => {
    const user = userEvent.setup();
    renderEditView();
    const goalInput = await waitForGoalInput();

    await user.type(goalInput, " with edits");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: "Keep editing" }));

    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "Discard changes?" }),
      ).not.toBeInTheDocument();
    });
    expect(screen.getByRole("heading", { name: "Edit task" })).toBeVisible();
    expect(goalInput).toHaveValue(`${savedTask.goal} with edits`);
    expect(navigate).not.toHaveBeenCalled();
  });

  it("leaves when discard changes is confirmed", async () => {
    const user = userEvent.setup();
    renderEditView();
    const goalInput = await waitForGoalInput();

    await user.type(goalInput, " with edits");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: "Discard changes" }));

    expect(navigate).toHaveBeenCalledWith("/tasks");
  });

  it("persists edits through updateTask and stays on the page", async () => {
    const user = userEvent.setup();
    renderEditView();
    const goalInput = await waitForGoalInput();

    await user.clear(goalInput);
    await user.type(goalInput, "Compose monthly status report");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(shaidenClient.updateTask).toHaveBeenCalledWith(savedTask.id, {
        goal: "Compose monthly status report",
        trigger: { type: "now" },
        assignee: shaidenAgent.id,
        limits: { max_iterations: 25, timeout_seconds: 600 },
      });
    });
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Save changes" }),
      ).toBeDisabled();
    });
    expect(navigate).not.toHaveBeenCalled();
  });

  it("archives a task after confirmation", async () => {
    const user = userEvent.setup();
    vi.mocked(shaidenClient.archiveTask).mockResolvedValue();
    renderEditView();
    await waitForGoalInput();

    await user.click(screen.getByRole("button", { name: "Archive" }));
    expect(
      screen.getByRole("dialog", { name: "Archive task?" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Archive task" }));

    await waitFor(() => {
      expect(shaidenClient.archiveTask).toHaveBeenCalledWith(savedTask.id);
    });
    expect(navigate).toHaveBeenCalledWith("/tasks");
  });

  it("shows archived tasks as read-only", async () => {
    vi.mocked(shaidenClient.fetchTask).mockResolvedValue({
      task: {
        ...savedTask,
        archivedAt: "2026-07-14T12:00:00.000Z",
      },
    });
    renderEditView();
    const goalInput = await waitForGoalInput();

    expect(goalInput).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: "Archive" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Save changes" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Cancel" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/this task is archived/i)).toBeInTheDocument();
  });
});

describe("TaskAuthoringView new task", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("creates a scheduled task without starting a run", async () => {
    const user = userEvent.setup();
    vi.mocked(shaidenClient.createTask).mockResolvedValue({
      task: {
        ...savedTask,
        trigger: {
          type: "schedule",
          timezone: "UTC",
          at: "2099-01-01T09:00",
        },
      },
    });

    renderCreateView();

    await user.type(
      await screen.findByPlaceholderText(/describe what "done" looks like/i),
      "Nightly digest",
    );
    await user.click(screen.getByRole("button", { name: "Scheduled" }));
    await user.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => {
      expect(shaidenClient.createTask).toHaveBeenCalled();
    });
    expect(shaidenClient.startTaskRun).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith("/tasks");
  });
});
