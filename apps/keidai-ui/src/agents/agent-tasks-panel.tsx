import { Button, Spinner } from "@keidai/ui";
import {
  isScheduleTrigger,
  type RunListItem,
  type SavedTask,
} from "@keidai/shared";
import { ListChecks, Loader2, Pencil, Play, Plus } from "lucide-react";
import { useState } from "react";
import { PageEmptyState } from "../shell/components/page-content/page-empty-state.js";
import { GoalVerdictPill } from "./components/goal-verdict-pill.js";
import { formatNextRunLabel } from "../tasks/utils/format-schedule.js";
import {
  SEVEN_DAYS_MS,
  countRunsForTask,
  lastOutcomeForTask,
  scheduleLabel,
} from "./utils/agent-activity.js";

export function AgentTasksPanel({
  tasks,
  runs,
  isLoading,
  onNew,
  onEdit,
  onRun,
  startingTaskIds,
  runError,
}: {
  tasks: readonly SavedTask[];
  runs: readonly RunListItem[];
  isLoading: boolean;
  onNew: () => void;
  onEdit: (taskId: string) => void;
  onRun: (taskId: string) => void;
  startingTaskIds: ReadonlySet<string>;
  runError: string | null;
}) {
  const [since] = useState(() => Date.now() - SEVEN_DAYS_MS);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Spinner className="size-4" aria-hidden />
        Loading tasks…
      </div>
    );
  }

  if (tasks.length === 0) {
    return (
      <PageEmptyState
        icon={<ListChecks className="size-7.5" aria-hidden />}
        title="No tasks yet"
        description="This agent has nothing to do until you assign a goal. New tasks created here are pre-assigned to this agent."
        action={
          <Button type="button" onClick={onNew}>
            <Plus className="size-4" aria-hidden />
            New task for this agent
          </Button>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <p
          className="
          max-w-155 text-[12.5px] leading-normal text-muted-foreground
        "
        >
          Every task assigned to this agent. A task is a standing goal — the
          agent is who carries it out.
        </p>
        <Button type="button" size="sm" className="shrink-0" onClick={onNew}>
          <Plus className="size-3.5" aria-hidden />
          New task for this agent
        </Button>
      </div>

      {runError ? <p className="text-sm text-destructive">{runError}</p> : null}

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div
          className="
          grid grid-cols-[1.5fr_.95fr_.85fr_66px_148px] gap-3.5 border-b
          border-border px-4.5 py-2.5 text-[10.5px] font-semibold
          tracking-[0.06em] text-muted-foreground uppercase
        "
        >
          <span>Goal</span>
          <span>Schedule</span>
          <span>Last outcome</span>
          <span>7d</span>
          <span />
        </div>
        {tasks.map((task) => {
          const outcome = lastOutcomeForTask(runs, task.id);
          const starting = startingTaskIds.has(task.id);
          return (
            <div
              key={task.id}
              className="
                grid grid-cols-[1.5fr_.95fr_.85fr_66px_148px] items-center
                gap-3.5 border-b border-border px-4.5 py-3
                last:border-b-0
                hover:bg-muted/45
              "
            >
              <div className="min-w-0">
                <div className="truncate text-[13px] font-semibold">
                  {task.goal}
                </div>
                <div
                  className="
                  mt-0.5 font-mono text-[11px] text-muted-foreground
                "
                >
                  {task.id}
                </div>
              </div>
              <div className="min-w-0">
                <div className="text-[12.5px]">{scheduleLabel(task)}</div>
                <div
                  className="
                  mt-0.5 font-mono text-[11px] text-muted-foreground
                "
                >
                  {task.trigger.type === "now"
                    ? "no schedule"
                    : formatNextRunLabel(
                        task.nextRunAt,
                        Boolean(
                          isScheduleTrigger(task.trigger) &&
                          task.trigger.paused,
                        ),
                        Date.now(),
                        Boolean(task.scheduleFailedAt),
                      )}
                </div>
              </div>
              <div className="min-w-0">
                {outcome ? (
                  <GoalVerdictPill verdict={outcome} />
                ) : (
                  <span className="text-[12px] text-muted-foreground">
                    Never run
                  </span>
                )}
              </div>
              <div className="font-mono text-[12.5px] text-muted-foreground">
                {countRunsForTask(runs, task.id, since)}
              </div>
              <div className="flex justify-end gap-1.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2.5 text-muted-foreground"
                  onClick={() => onEdit(task.id)}
                >
                  <Pencil className="size-3" aria-hidden />
                  Edit
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 px-2.5"
                  disabled={starting}
                  onClick={() => onRun(task.id)}
                >
                  {starting ? (
                    <Loader2 className="size-3 animate-spin" aria-hidden />
                  ) : (
                    <Play className="size-3" aria-hidden />
                  )}
                  Run
                </Button>
              </div>
            </div>
          );
        })}
        <div className="px-4.5 py-2.5 text-[11.5px] text-muted-foreground">
          {tasks.length} task{tasks.length === 1 ? "" : "s"} assigned
        </div>
      </div>
    </div>
  );
}
