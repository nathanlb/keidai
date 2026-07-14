import {
  Badge,
  Button,
  cn,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  Textarea,
} from "@keidai/ui";
import {
  DEFAULT_TASK_LIMITS,
  taskSchema,
  type PublicAgentConfig,
  type Task,
} from "@keidai/shared";
import {
  Bot,
  Calendar,
  GitBranch,
  Info,
  Loader2,
  Lock,
  Play,
  Repeat,
  Save,
  SlidersHorizontal,
  Target,
  Timer,
  Zap,
} from "lucide-react";
import {
  useEffect,
  useId,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { useNavigate } from "react-router-dom";
import { fetchTask, startTaskRun, updateTask } from "../api/shaiden-client.js";
import { useFetchTaskRuntime } from "../hooks/use-fetch-task-runtime.js";
import { useActingOwner } from "../../shell/hooks/use-acting-owner.js";
import { useFetchAgents } from "../../shell/hooks/use-fetch-agents.js";
import {
  toAgentAssigneeOption,
  type AgentAssigneeOption,
} from "./utils/to-agent-assignee-option.js";

const V0_LOCKED_LIMITS = DEFAULT_TASK_LIMITS;
const WALL_CLOCK_MINUTES = V0_LOCKED_LIMITS.timeout_seconds / 60;

function buildTask(goal: string, assignee: string): Task {
  return taskSchema.parse({
    goal: goal.trim(),
    trigger: { type: "now" },
    assignee,
    limits: V0_LOCKED_LIMITS,
  });
}

function FieldHeader({
  icon,
  label,
  required,
  badge,
}: {
  icon: ReactNode;
  label: string;
  required?: boolean;
  badge?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="inline-flex text-muted-foreground">{icon}</span>
      <span className="text-[13.5px] font-semibold">{label}</span>
      {required ? (
        <span className="text-[11px] text-destructive">required</span>
      ) : null}
      {badge}
    </div>
  );
}

function TriggerChip({
  selected,
  disabled,
  icon,
  label,
}: {
  selected?: boolean;
  disabled?: boolean;
  icon: ReactNode;
  label: string;
}) {
  return (
    <div
      aria-disabled={disabled || undefined}
      className={cn(
        "flex flex-1 items-center gap-2 rounded-md px-3 py-2.5 text-[13px]",
        selected
          ? "border border-ring bg-primary/10 font-semibold"
          : "border border-border text-muted-foreground",
        disabled && "cursor-not-allowed opacity-60",
      )}
    >
      <span className="inline-flex shrink-0">{icon}</span>
      <span>{label}</span>
      {selected ? (
        <span
          className="ml-auto size-4 shrink-0 rounded-full border-[5px] border-primary"
          aria-hidden
        />
      ) : (
        <Lock className="ml-auto size-3 shrink-0" aria-hidden />
      )}
    </div>
  );
}

function AssigneeTriggerContent({
  option,
}: {
  option: AgentAssigneeOption | null;
}) {
  if (!option) {
    return (
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full border border-dashed border-border text-muted-foreground">
          <Bot className="size-3.5" aria-hidden />
        </span>
        <span className="text-[13px] text-muted-foreground">
          Select an agent
        </span>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-1 items-center gap-2.5">
      <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-md bg-secondary text-[11px] font-medium text-secondary-foreground">
        {option.initials}
      </span>
      <span className="flex min-w-0 items-center gap-2">
        <span className="truncate text-[13px] font-semibold text-foreground">
          {option.displayName}
        </span>
        <span className="shrink-0 font-mono text-[11.5px] text-muted-foreground">
          {option.agentId}
        </span>
      </span>
      {option.connected ? (
        <span className="ml-auto inline-flex shrink-0 items-center gap-1.5 text-[11.5px] text-(--green-600)">
          <span
            className="size-1.5 rounded-full bg-(--green-600)"
            aria-hidden
          />
          connected
        </span>
      ) : null}
    </div>
  );
}

interface TaskAuthoringViewProps {
  taskId?: string;
  onCancel?: () => void;
  onTaskSaved?: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}

export function TaskAuthoringView({
  taskId,
  onCancel,
  onTaskSaved,
  onDirtyChange,
}: TaskAuthoringViewProps) {
  const isEditMode = Boolean(taskId);
  const navigate = useNavigate();
  const goalId = useId();

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

  const runtimeAgentId = runtime?.agentId;

  const options = useMemo(() => {
    const agents = agentsData?.agents;
    if (!agents) {
      return [];
    }
    return agents
      .map((agent: PublicAgentConfig) =>
        toAgentAssigneeOption(agent, runtimeAgentId),
      )
      .sort((a, b) => a.agentId.localeCompare(b.agentId));
  }, [agentsData?.agents, runtimeAgentId]);

  const [goal, setGoal] = useState("");
  const [assignee, setAssignee] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingTask, setIsLoadingTask] = useState(isEditMode);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [savedSnapshot, setSavedSnapshot] = useState<{
    goal: string;
    assignee: string;
  } | null>(null);

  const isDirty =
    isEditMode &&
    savedSnapshot !== null &&
    (goal.trim() !== savedSnapshot.goal.trim() ||
      assignee !== savedSnapshot.assignee);

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  useEffect(() => {
    if (!taskId) {
      setGoal("");
      setAssignee("");
      setLoadError(null);
      setIsLoadingTask(false);
      setSavedSnapshot(null);
      return;
    }

    let cancelled = false;
    setIsLoadingTask(true);
    setLoadError(null);
    setSavedSnapshot(null);

    void fetchTask(taskId)
      .then(({ task }) => {
        if (cancelled) {
          return;
        }
        setGoal(task.goal);
        setAssignee(task.assignee);
        setSavedSnapshot({ goal: task.goal, assignee: task.assignee });
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
  }, [taskId]);

  useEffect(() => {
    if (isEditMode || assignee || !runtimeAgentId) {
      return;
    }
    const connected = options.find(
      (option) => option.agentId === runtimeAgentId && option.connected,
    );
    if (connected) {
      setAssignee(connected.agentId);
    }
  }, [assignee, isEditMode, options, runtimeAgentId]);

  const selectedOption =
    options.find((option) => option.agentId === assignee) ?? null;

  const canSubmit =
    goal.trim().length > 0 &&
    Boolean(runtimeAgentId) &&
    assignee === runtimeAgentId &&
    (!isEditMode || isDirty) &&
    !isSubmitting &&
    !isLoadingTask &&
    !loadError &&
    !agentsLoading &&
    !runtimeLoading &&
    !agentsError &&
    !runtimeError;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitError(null);

    let task: Task;
    try {
      task = buildTask(goal, assignee);
    } catch {
      setSubmitError("Check goal and assignee before running.");
      return;
    }

    setIsSubmitting(true);
    try {
      if (taskId) {
        await updateTask(taskId, task);
        onTaskSaved?.();
        return;
      }

      const { runId } = await startTaskRun(task);
      onTaskSaved?.();
      void navigate(`/shaiden/runs?run=${encodeURIComponent(runId)}`);
    } catch (error) {
      setSubmitError(
        error instanceof Error
          ? error.message
          : taskId
            ? "Failed to save task"
            : "Failed to start task",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleCancel() {
    if (onCancel) {
      onCancel();
      return;
    }
    void navigate("/shaiden/runs");
  }

  return (
    <form
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={onSubmit}
    >
      <div className="min-h-0 flex-1 overflow-y-auto px-6">
        {isLoadingTask ? (
          <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Loading task…
          </div>
        ) : null}

        {loadError ? (
          <p className="py-8 text-sm text-destructive">{loadError}</p>
        ) : isLoadingTask ? null : (
          <>
        <section className="border-b border-border py-5">
          <FieldHeader
            icon={<Target className="size-4" aria-hidden />}
            label="Goal"
            required
          />
          <p className="mt-1 mb-2.5 text-[12.5px] leading-normal text-muted-foreground">
            Natural-language definition of done. The agent self-assesses
            completion against it.
          </p>
          <Textarea
            id={goalId}
            value={goal}
            onChange={(event) => setGoal(event.target.value)}
            placeholder={`Describe what "done" looks like…  e.g. "Draft and send the weekly newsletter, but pause for my approval before sending."`}
            required
            className="min-h-[118px] bg-background text-[13.5px] leading-relaxed shadow-none focus-visible:ring-[3px] focus-visible:ring-ring/30"
          />
        </section>

        <section className="border-b border-border py-5">
          <FieldHeader
            icon={<Zap className="size-3.5" aria-hidden />}
            label="Trigger"
          />
          <p className="mt-1 mb-2.5 text-[12.5px] leading-normal text-muted-foreground">
            v0 runs immediately. Scheduled and event triggers are planned.
          </p>
          <div className="flex gap-2">
            <TriggerChip
              selected
              icon={<Zap className="size-3.5" aria-hidden />}
              label="Now"
            />
            <TriggerChip
              disabled
              icon={<Calendar className="size-3.5" aria-hidden />}
              label="Scheduled"
            />
            <TriggerChip
              disabled
              icon={<GitBranch className="size-3.5" aria-hidden />}
              label="On event"
            />
          </div>
        </section>

        <section className="border-b border-border py-5">
          <FieldHeader
            icon={<Bot className="size-3.5" aria-hidden />}
            label="Assignee"
            required
          />
          <p className="mt-1 mb-2.5 text-[12.5px] leading-normal text-muted-foreground">
            Runs on exactly one agent in v0.
          </p>
          {agentsLoading || runtimeLoading ? (
            <p className="text-sm text-muted-foreground">
              {agentsLoading ? "Loading agents…" : "Loading runtime…"}
            </p>
          ) : agentsError ? (
            <p className="text-sm text-destructive">
              Could not load agents from the gateway.
            </p>
          ) : runtimeError ? (
            <p className="text-sm text-destructive">
              Could not load Shaiden runtime.
            </p>
          ) : options.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No agents registered in Torii yet.
            </p>
          ) : !runtimeAgentId ? (
            <p className="text-sm text-muted-foreground">
              Shaiden runtime is unavailable.
            </p>
          ) : !options.some((option) => option.connected) ? (
            <p className="text-sm text-muted-foreground">
              No agent connected to this Shaiden runtime (
              <span className="font-mono">{runtimeAgentId}</span>).
            </p>
          ) : (
            <Select value={assignee || undefined} onValueChange={setAssignee}>
              <SelectTrigger
                className={cn(
                  "h-auto min-h-11 w-full items-center gap-2.5 border-input bg-background px-3 py-2 shadow-none",
                )}
              >
                <AssigneeTriggerContent option={selectedOption} />
              </SelectTrigger>
              <SelectContent>
                {options.map((option) => (
                  <SelectItem
                    key={option.agentId}
                    value={option.agentId}
                    disabled={!option.connected}
                  >
                    <span className="flex items-center gap-2.5">
                      <span className="inline-flex size-7 items-center justify-center rounded-md bg-secondary text-[11px] font-medium text-secondary-foreground">
                        {option.initials}
                      </span>
                      <span className="flex flex-row items-center gap-2">
                        <span className="text-[13px] font-semibold">
                          {option.displayName}
                        </span>
                        <span className="font-mono text-[11.5px] text-muted-foreground">
                          {option.agentId}
                        </span>
                      </span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </section>

        <section className="py-5">
          <FieldHeader
            icon={<SlidersHorizontal className="size-3.5" aria-hidden />}
            label="Limits"
            badge={
              <Badge
                variant="secondary"
                className="gap-1.5 text-[10.5px] font-normal"
              >
                <Lock className="size-3" aria-hidden />
                Defaults · locked in v0
              </Badge>
            }
          />
          <p className="mt-1 mb-2.5 text-[12.5px] leading-normal text-muted-foreground">
            Fixed in v0. A run terminates{" "}
            <span className="font-mono">iteration_exhausted</span> or{" "}
            <span className="font-mono">timeout</span> if it hits these.
          </p>
          <div className="flex gap-3">
            <div className="min-w-0 flex-1">
              <div className="mb-1.5 text-xs text-muted-foreground">
                Iteration cap
              </div>
              <div className="flex items-center gap-2.5 rounded-md border border-border bg-muted px-3 py-2.5 opacity-75">
                <Repeat
                  className="size-3.5 shrink-0 text-muted-foreground"
                  aria-hidden
                />
                <span className="font-mono text-[13.5px] font-semibold">
                  {V0_LOCKED_LIMITS.max_iterations}
                </span>
                <span className="ml-auto text-xs text-muted-foreground">
                  iterations
                </span>
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <div className="mb-1.5 text-xs text-muted-foreground">
                Wall-clock timeout
              </div>
              <div className="flex items-center gap-2.5 rounded-md border border-border bg-muted px-3 py-2.5 opacity-75">
                <Timer
                  className="size-3.5 shrink-0 text-muted-foreground"
                  aria-hidden
                />
                <span className="font-mono text-[13.5px] font-semibold">
                  {WALL_CLOCK_MINUTES}
                </span>
                <span className="ml-auto text-xs text-muted-foreground">
                  minutes
                </span>
              </div>
            </div>
          </div>
        </section>

        {submitError ? (
          <p className="pb-5 text-sm text-destructive">{submitError}</p>
        ) : null}
          </>
        )}
      </div>

      <div className="flex shrink-0 flex-col gap-3 border-t border-border px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
          <Info className="size-3.5 shrink-0" aria-hidden />
          <span className="truncate">
            Executes on the assigned agent · runs as{" "}
            <span className="font-mono text-foreground">{owner.ownerId}</span>
          </span>
        </div>
        <div className="flex shrink-0 gap-2.5 sm:ml-auto">
          <Button type="button" variant="ghost" onClick={handleCancel}>
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={!canSubmit}
            className={cn(!canSubmit && "opacity-45 grayscale")}
          >
            {isSubmitting ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : isEditMode ? (
              <Save className="size-4" aria-hidden />
            ) : (
              <Play className="size-4" aria-hidden />
            )}
            {isEditMode ? "Save changes" : "Create & run"}
          </Button>
        </div>
      </div>
    </form>
  );
}
