import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { PublicAgentConfig, SavedTask } from "@keidai/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as shaidenClient from "../../api/shaiden-client.js";
import { TaskAuthoringDialog } from "../task-authoring-dialog.js";

const shaidenAgent: PublicAgentConfig = {
  agent_id: "shaiden-newsletter-01",
  owner_id: "nathanlb",
  subject: {
    kind: "k8s_service_account",
    namespace: "agents",
    service_account: "shaiden",
  },
  groups: [],
};

const savedTask: SavedTask = {
  id: "task-saved-1",
  goal: "Compose weekly status report",
  trigger: { type: "now" },
  assignee: shaidenAgent.agent_id,
  createdAt: "2026-07-13T12:00:00.000Z",
  updatedAt: "2026-07-13T12:00:00.000Z",
};

vi.mock("../../api/shaiden-client.js", () => ({
  fetchTask: vi.fn(),
  updateTask: vi.fn(),
  startTaskRun: vi.fn(),
}));

vi.mock("../../hooks/use-fetch-task-runtime.js", () => ({
  useFetchTaskRuntime: () => ({
    data: { agentId: shaidenAgent.agent_id },
    error: undefined,
    isLoading: false,
  }),
}));

vi.mock("../../../shell/hooks/use-fetch-agents.js", () => ({
  useFetchAgents: () => ({
    data: { agents: [shaidenAgent] },
    error: undefined,
    isLoading: false,
  }),
}));

vi.mock("../../../shell/hooks/use-acting-owner.js", () => ({
  useActingOwner: () => ({
    owner: { ownerId: "nathanlb", initials: "NL" },
  }),
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>(
    "react-router-dom",
  );
  return {
    ...actual,
    useNavigate: () => vi.fn(),
  };
});

function renderEditDialog({
  onOpenChange = vi.fn(),
  onTaskSaved = vi.fn(),
}: {
  onOpenChange?: (open: boolean) => void;
  onTaskSaved?: () => void;
} = {}) {
  render(
    <TaskAuthoringDialog
      open
      onOpenChange={onOpenChange}
      taskId={savedTask.id}
      onTaskSaved={onTaskSaved}
    />,
  );

  return { onOpenChange, onTaskSaved };
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

describe("TaskAuthoringDialog edit mode", () => {
  beforeEach(() => {
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
    renderEditDialog();
    await waitForGoalInput();

    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
  });

  it("enables save after the goal changes", async () => {
    const user = userEvent.setup();
    renderEditDialog();
    const goalInput = await waitForGoalInput();

    await user.clear(goalInput);
    await user.type(goalInput, "Compose monthly status report");

    expect(screen.getByRole("button", { name: "Save changes" })).toBeEnabled();
  });

  it("closes without confirmation when canceling a clean form", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    renderEditDialog({ onOpenChange });
    await waitForGoalInput();

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(
      screen.queryByRole("dialog", { name: "Discard changes?" }),
    ).not.toBeInTheDocument();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("prompts before discarding dirty edits", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    renderEditDialog({ onOpenChange });
    const goalInput = await waitForGoalInput();

    await user.type(goalInput, " with edits");
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(
      screen.getByRole("dialog", { name: "Discard changes?" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Edit task")).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("returns to the edit form when keep editing is chosen", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    renderEditDialog({ onOpenChange });
    const goalInput = await waitForGoalInput();

    await user.type(goalInput, " with edits");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: "Keep editing" }));

    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "Discard changes?" }),
      ).not.toBeInTheDocument();
    });
    expect(screen.getByRole("dialog", { name: "Edit task" })).toBeInTheDocument();
    expect(goalInput).toHaveValue(`${savedTask.goal} with edits`);
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("closes when discard changes is confirmed", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    renderEditDialog({ onOpenChange });
    const goalInput = await waitForGoalInput();

    await user.type(goalInput, " with edits");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: "Discard changes" }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("persists edits through updateTask and closes on save", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const onTaskSaved = vi.fn();
    renderEditDialog({ onOpenChange, onTaskSaved });
    const goalInput = await waitForGoalInput();

    await user.clear(goalInput);
    await user.type(goalInput, "Compose monthly status report");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(shaidenClient.updateTask).toHaveBeenCalledWith(savedTask.id, {
        goal: "Compose monthly status report",
        trigger: { type: "now" },
        assignee: shaidenAgent.agent_id,
        limits: { max_iterations: 25, timeout_seconds: 600 },
      });
    });
    expect(onTaskSaved).toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
