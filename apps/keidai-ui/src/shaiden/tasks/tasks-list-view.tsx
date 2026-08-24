import { PageEmptyState } from "../../shell/components/page-content/page-empty-state.js";
import {
  Button,
  Card,
  CardContent,
  Spinner,
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@keidai/ui";
import { ListChecks, Plus } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import { TablePaginationFooter } from "../../shell/components/table-pagination/table-pagination-footer.js";
import { paginateItems } from "../../shell/components/table-pagination/paginate-items.js";
import { useTablePageIndex } from "../../shell/components/table-pagination/use-table-page-index.js";
import { runSavedTask } from "../api/shaiden-client.js";
import { useFetchTasks } from "../hooks/use-fetch-tasks.js";
import { useRunsVisibility } from "../hooks/use-runs-visibility.js";
import {
  NEW_TASK_PARAM,
  runDetailHref,
  TASK_PARAM,
  TASKS_PATH,
} from "../navigation.js";
import { TaskAuthoringDialog } from "./task-authoring-dialog.js";
import { TasksTableRow } from "./tasks-table-row.js";
import { tasksTableColumns } from "./tasks-table-columns.js";
import { collectRunningTaskIds } from "./utils/collect-running-task-ids.js";

function TasksEmptyState({ onNewTask }: { onNewTask: () => void }) {
  return (
    <PageEmptyState
      icon={<ListChecks className="size-7.5" aria-hidden />}
      title="No saved tasks yet"
      description="Author a goal, assign an agent, and run it. Saved tasks can be re-run without re-entering the configuration."
      action={
        <Button type="button" onClick={onNewTask}>
          <Plus className="size-4" aria-hidden />
          New task
        </Button>
      }
    />
  );
}

export function TasksListView() {
  const navigate = useNavigate();
  const { taskId: taskIdFromPath } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const editTaskId = taskIdFromPath ?? searchParams.get(TASK_PARAM);
  const newTaskFromQuery = searchParams.has(NEW_TASK_PARAM);
  const { data, error, isLoading, refresh } = useFetchTasks();
  const { runs } = useRunsVisibility(true);
  const [newTaskOpen, setNewTaskOpen] = useState(false);
  const [startingTaskIds, setStartingTaskIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [runError, setRunError] = useState<string | null>(null);

  const tasks = data?.tasks ?? [];
  const runningTaskIds = useMemo(() => collectRunningTaskIds(runs), [runs]);
  const authoringOpen = newTaskOpen || newTaskFromQuery || Boolean(editTaskId);
  const { pageIndex, onPageChange } = useTablePageIndex([tasks.length]);
  const {
    pageItems: pageTasks,
    shownCount,
    canGoNewer,
    canGoOlder,
  } = paginateItems(tasks, pageIndex);

  const syncTaskParam = useCallback(
    (taskId: string | null) => {
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current);
          if (taskId) {
            next.set(TASK_PARAM, taskId);
          } else {
            next.delete(TASK_PARAM);
          }
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const openNewTask = useCallback(() => {
    syncTaskParam(null);
    setNewTaskOpen(true);
  }, [syncTaskParam]);

  const onAuthoringOpenChange = useCallback(
    (open: boolean) => {
      if (open) {
        return;
      }
      setNewTaskOpen(false);
      if (taskIdFromPath) {
        navigate(TASKS_PATH, { replace: true });
        return;
      }
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current);
          next.delete(TASK_PARAM);
          next.delete(NEW_TASK_PARAM);
          return next;
        },
        { replace: true },
      );
    },
    [navigate, setSearchParams, taskIdFromPath],
  );

  const handleRunTask = useCallback(
    async (taskId: string) => {
      setRunError(null);
      setStartingTaskIds((current) => {
        const next = new Set(current);
        next.add(taskId);
        return next;
      });
      try {
        const { runId } = await runSavedTask(taskId);
        void navigate(runDetailHref(runId));
      } catch (err) {
        setRunError(
          err instanceof Error ? err.message : "Failed to start task",
        );
      } finally {
        setStartingTaskIds((current) => {
          const next = new Set(current);
          next.delete(taskId);
          return next;
        });
      }
    },
    [navigate],
  );

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Spinner className="size-4" aria-hidden />
        Loading tasks…
      </div>
    );
  }

  if (error) {
    return (
      <p className="text-sm text-destructive">
        Could not load saved tasks from Shaiden.
      </p>
    );
  }

  return (
    <>
      {tasks.length === 0 ? (
        <TasksEmptyState onNewTask={openNewTask} />
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[13px] text-muted-foreground">
              {tasks.length} saved task{tasks.length === 1 ? "" : "s"}
            </p>
            <Button type="button" size="sm" onClick={openNewTask}>
              <Plus className="size-3.5" aria-hidden />
              New task
            </Button>
          </div>

          {runError ? (
            <p className="text-sm text-destructive">{runError}</p>
          ) : null}

          <Card className="overflow-hidden shadow-none">
            <CardContent className="px-0 py-0">
              <Table
                className={tasksTableColumns.tableClassName}
                style={tasksTableColumns.tableStyle}
              >
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead
                      className={tasksTableColumns.headClassName("goal")}
                      style={tasksTableColumns.headStyle("goal")}
                    >
                      Goal
                    </TableHead>
                    <TableHead
                      className={tasksTableColumns.headClassName("assignee")}
                      style={tasksTableColumns.headStyle("assignee")}
                    >
                      Assignee
                    </TableHead>
                    <TableHead
                      className={tasksTableColumns.headClassName("updated")}
                      style={tasksTableColumns.headStyle("updated")}
                    >
                      Updated
                    </TableHead>
                    <TableHead
                      className={tasksTableColumns.headClassName("actions")}
                      style={tasksTableColumns.headStyle("actions")}
                    >
                      Actions
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pageTasks.map((task) => (
                    <TasksTableRow
                      key={task.id}
                      task={task}
                      isRunning={
                        runningTaskIds.has(task.id) ||
                        startingTaskIds.has(task.id)
                      }
                      onEdit={() => syncTaskParam(task.id)}
                      onRun={() => void handleRunTask(task.id)}
                    />
                  ))}
                </TableBody>
              </Table>
              <TablePaginationFooter
                shownCount={shownCount}
                totalCount={tasks.length}
                totalLabel="saved tasks"
                canGoNewer={canGoNewer}
                canGoOlder={canGoOlder}
                onPageChange={onPageChange}
                pageIndex={pageIndex}
              />
            </CardContent>
          </Card>
        </div>
      )}

      <TaskAuthoringDialog
        open={authoringOpen}
        onOpenChange={onAuthoringOpenChange}
        taskId={
          newTaskOpen || newTaskFromQuery
            ? undefined
            : (editTaskId ?? undefined)
        }
        onTaskSaved={() => void refresh()}
      />
    </>
  );
}
