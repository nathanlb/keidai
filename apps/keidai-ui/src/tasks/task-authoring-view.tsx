import type { Task } from "@keidai/shared";
import { Button } from "@keidai/ui";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { FormProvider } from "react-hook-form";
import { useNavigate } from "react-router";
import { useSWRConfig } from "swr";
import type { ManagementAgent } from "../lib/api/agents.js";
import {
  archiveTask,
  createTask,
  fetchTask,
  startTaskRun,
  updateTask,
} from "../lib/api/tasks.js";
import { TASKS_PATH } from "./navigation.js";
import { runDetailHref } from "../runs/navigation.js";
import { useFetchTaskRuntime } from "./hooks/use-fetch-task-runtime.js";
import { TASKS_KEY } from "./hooks/use-fetch-tasks.js";
import { useActingOwner } from "../shell/hooks/use-acting-owner.js";
import { useFetchAgents } from "../lib/hooks/use-fetch-agents.js";
import { useZodForm } from "../shell/forms/use-zod-form.js";
import {
  emptyTaskAuthoringValues,
  formValuesFromTask,
  taskAuthoringFormSchema,
  taskFromFormValues,
} from "./schemas/task-authoring-form-schema.js";
import { toAgentAssigneeOption } from "./utils/to-agent-assignee-option.js";
import {
  ArchiveTaskDialog,
  DiscardChangesDialog,
} from "./components/task-authoring-confirm-dialogs.js";
import { TaskAssigneeSection } from "./components/task-assignee-section.js";
import { TaskAuthoringFooter } from "./components/task-authoring-footer.js";
import { TaskGoalSection } from "./components/task-goal-section.js";
import { TaskLimitsSection } from "./components/task-limits-section.js";
import { TaskTriggerSection } from "./components/task-trigger-section.js";

const EMPTY_FORM_VALUES = emptyTaskAuthoringValues();

interface TaskAuthoringViewProps {
  taskId?: string;
  defaultAssignee?: string;
}

export function TaskAuthoringView({
  taskId,
  defaultAssignee,
}: TaskAuthoringViewProps) {
  const isEditMode = Boolean(taskId);
  const navigate = useNavigate();
  const { mutate } = useSWRConfig();

  const {
    data: agentsData,
    error: agentsError,
    isLoading: agentsLoading,
  } = useFetchAgents();
  const {
    data: runtime,
    error: runtimeError,
    isLoading: runtimeLoading,
  } = useFetchTaskRuntime();
  const { owner } = useActingOwner();

  const runtimeReady = runtime?.ready === true;

  const options = useMemo(() => {
    const agents = agentsData?.agents;
    if (!agents) {
      return [];
    }
    return agents
      .map((agent: ManagementAgent) =>
        toAgentAssigneeOption(agent, runtimeReady),
      )
      .sort((a, b) => a.agentId.localeCompare(b.agentId));
  }, [agentsData?.agents, runtimeReady]);

  const [submitError, setSubmitError] = useState<string | null>(null);
  const [syncedTaskId, setSyncedTaskId] = useState(taskId);
  const [isLoadingTask, setIsLoadingTask] = useState(isEditMode);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isArchived, setIsArchived] = useState(false);
  const [scheduleFailure, setScheduleFailure] = useState<string | null>(null);
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false);
  const [archiveConfirmOpen, setArchiveConfirmOpen] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);

  const form = useZodForm(taskAuthoringFormSchema, {
    defaultValues: EMPTY_FORM_VALUES,
  });
  const {
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { isDirty, isSubmitting, isValid },
  } = form;

  if (taskId !== syncedTaskId) {
    setSyncedTaskId(taskId);
    if (!taskId) {
      reset(EMPTY_FORM_VALUES);
      setLoadError(null);
      setIsArchived(false);
      setScheduleFailure(null);
      setIsLoadingTask(false);
    } else {
      setIsLoadingTask(true);
      setLoadError(null);
    }
  }

  const assignee = watch("assignee");

  useEffect(() => {
    if (!taskId) {
      return;
    }

    let cancelled = false;

    void fetchTask(taskId)
      .then(({ task }) => {
        if (cancelled) {
          return;
        }
        setIsArchived(Boolean(task.archivedAt));
        setScheduleFailure(
          task.scheduleFailedAt ? (task.scheduleError ?? "") : null,
        );
        reset(formValuesFromTask(task));
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }
        setLoadError(
          error instanceof Error ? error.message : "Failed to load task",
        );
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingTask(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [taskId, reset]);

  useEffect(() => {
    if (isEditMode || assignee || !runtimeReady) {
      return;
    }
    const preferred = defaultAssignee
      ? options.find((option) => option.agentId === defaultAssignee)
      : undefined;
    const first = preferred ?? options[0];
    if (first) {
      setValue("assignee", first.agentId);
    }
  }, [assignee, defaultAssignee, isEditMode, options, runtimeReady, setValue]);

  const canSubmit =
    isValid &&
    Boolean(runtimeReady) &&
    Boolean(assignee) &&
    (!isEditMode || isDirty) &&
    !isSubmitting &&
    !isLoadingTask &&
    !loadError &&
    !isArchived &&
    !agentsLoading &&
    !runtimeLoading &&
    !agentsError &&
    !runtimeError;

  function leaveToList() {
    void mutate(TASKS_KEY);
    void navigate(TASKS_PATH);
  }

  function requestLeave() {
    if (isEditMode && isDirty) {
      setDiscardConfirmOpen(true);
      return;
    }
    leaveToList();
  }

  const onSubmit = handleSubmit(async (values) => {
    setSubmitError(null);

    let task: Task;
    try {
      task = taskFromFormValues(values);
    } catch {
      setSubmitError("Check goal and assignee before running.");
      return;
    }

    try {
      if (taskId) {
        const { task: saved } = await updateTask(taskId, task);
        setScheduleFailure(
          saved.scheduleFailedAt ? (saved.scheduleError ?? "") : null,
        );
        reset(formValuesFromTask(saved));
        void mutate(TASKS_KEY);
        return;
      }

      if (task.trigger.type === "schedule") {
        await createTask(task);
        void mutate(TASKS_KEY);
        void navigate(TASKS_PATH);
        return;
      }

      const { runId } = await startTaskRun(task);
      void mutate(TASKS_KEY);
      void navigate(runDetailHref(runId));
    } catch (error) {
      setSubmitError(
        error instanceof Error
          ? error.message
          : taskId
            ? "Failed to save task"
            : task.trigger.type === "schedule"
              ? "Failed to create task"
              : "Failed to start task",
      );
    }
  });

  async function handleArchiveConfirm() {
    if (!taskId) {
      return;
    }

    setIsArchiving(true);
    setArchiveError(null);
    try {
      await archiveTask(taskId);
      leaveToList();
    } catch (error) {
      setArchiveError(
        error instanceof Error ? error.message : "Failed to archive task",
      );
    } finally {
      setIsArchiving(false);
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="mb-3 -ml-2 text-muted-foreground"
        onClick={requestLeave}
      >
        <ArrowLeft className="size-3.5" aria-hidden />
        All tasks
      </Button>

      <h1 className="text-[23px] font-bold tracking-tight">
        {isEditMode ? "Edit task" : "New task"}
      </h1>
      <p className="mt-0.5 mb-5 text-[13.5px] text-muted-foreground">
        {isEditMode
          ? "Update the saved definition. Past runs keep the goal and config from when they started."
          : "Define a goal, pick an agent, and run it. Tasks are authored here and execute on the assigned agent."}
      </p>

      <FormProvider {...form}>
        <form className="flex max-w-180 flex-col" onSubmit={onSubmit}>
          <div
            className="
          flex flex-col gap-4.5 rounded-xl border border-border bg-card p-5
        "
          >
            {isLoadingTask ? (
              <div
                className="
                flex items-center gap-2 py-8 text-sm text-muted-foreground
              "
              >
                <Loader2 className="size-4 animate-spin" aria-hidden />
                Loading task…
              </div>
            ) : null}

            {loadError ? (
              <p className="py-8 text-sm text-destructive">{loadError}</p>
            ) : isLoadingTask ? null : (
              <>
                {isArchived ? (
                  <p
                    className="
                    border-b border-border py-4 text-sm text-muted-foreground
                  "
                  >
                    This task is archived. Past runs are preserved, but the
                    definition can no longer be edited or run.
                  </p>
                ) : null}
                <TaskGoalSection disabled={isArchived} />
                <TaskTriggerSection
                  disabled={isArchived}
                  isEditMode={isEditMode}
                  scheduleFailure={scheduleFailure}
                />
                <TaskAssigneeSection
                  disabled={isArchived}
                  options={options}
                  agentsLoading={agentsLoading}
                  runtimeLoading={runtimeLoading}
                  agentsError={agentsError}
                  runtimeError={runtimeError}
                  runtimeReady={runtimeReady}
                />
                <TaskLimitsSection />
                {submitError ? (
                  <p className="pb-5 text-sm text-destructive">{submitError}</p>
                ) : null}
              </>
            )}
          </div>

          <TaskAuthoringFooter
            canSubmit={canSubmit}
            isEditMode={isEditMode}
            isArchived={isArchived}
            ownerId={owner?.ownerId}
            onCancel={requestLeave}
            onArchiveRequest={
              isEditMode
                ? () => {
                    setArchiveError(null);
                    setArchiveConfirmOpen(true);
                  }
                : undefined
            }
          />
        </form>
      </FormProvider>

      <DiscardChangesDialog
        open={discardConfirmOpen}
        onOpenChange={setDiscardConfirmOpen}
        onKeepEditing={() => setDiscardConfirmOpen(false)}
        onDiscard={leaveToList}
      />
      <ArchiveTaskDialog
        open={archiveConfirmOpen}
        onOpenChange={(open) => {
          setArchiveConfirmOpen(open);
          if (!open) {
            setArchiveError(null);
          }
        }}
        onConfirm={() => void handleArchiveConfirm()}
        isArchiving={isArchiving}
        error={archiveError}
      />
    </>
  );
}
