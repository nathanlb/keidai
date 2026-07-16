import {
  Button,
  Card,
  CardContent,
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@keidai/ui";
import { ListChecks, Loader2, Plus } from "lucide-react";
import { useCallback, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { TablePaginationFooter } from "../../shell/components/table-pagination/table-pagination-footer.js";
import { paginateItems } from "../../shell/components/table-pagination/paginate-items.js";
import { useTablePageIndex } from "../../shell/components/table-pagination/use-table-page-index.js";
import { runSavedTask } from "../api/shaiden-client.js";
import { useFetchTasks } from "../hooks/use-fetch-tasks.js";
import { TASK_PARAM } from "../navigation.js";
import { TaskAuthoringDialog } from "./task-authoring-dialog.js";
import { TasksTableRow } from "./tasks-table-row.js";
import { tasksTableColumns } from "./tasks-table-columns.js";

function TasksEmptyState({ onNewTask }: { onNewTask: () => void }) {
  return (
    <Card className="shadow-none">
      <CardContent className="flex flex-col items-center px-6 py-[60px] text-center">
        <span className="flex size-[52px] items-center justify-center rounded-[14px] bg-muted/55 text-muted-foreground">
          <ListChecks className="size-[30px]" aria-hidden />
        </span>
        <div className="mt-4 text-base font-semibold">No saved tasks yet</div>
        <p className="mt-1.5 max-w-[380px] text-[13px] leading-normal text-muted-foreground">
          Author a goal, assign an agent, and run it. Saved tasks can be re-run
          without re-entering the configuration.
        </p>
        <Button type="button" className="mt-4" onClick={onNewTask}>
          <Plus className="size-4" aria-hidden />
          New task
        </Button>
      </CardContent>
    </Card>
  );
}

export function TasksListView() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const editTaskId = searchParams.get(TASK_PARAM);
  const { data, error, isLoading, refresh } = useFetchTasks();
  const [newTaskOpen, setNewTaskOpen] = useState(false);
  const [runningTaskId, setRunningTaskId] = useState<string | null>(null);
  const [runError, setRunError] = useState<string | null>(null);

  const tasks = data?.tasks ?? [];
  const authoringOpen = newTaskOpen || Boolean(editTaskId);
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
      syncTaskParam(null);
    },
    [syncTaskParam],
  );

  const handleRunTask = useCallback(
    async (taskId: string) => {
      setRunError(null);
      setRunningTaskId(taskId);
      try {
        const { runId } = await runSavedTask(taskId);
        void navigate(`/shaiden/runs?run=${encodeURIComponent(runId)}`);
      } catch (err) {
        setRunError(
          err instanceof Error ? err.message : "Failed to start task",
        );
      } finally {
        setRunningTaskId(null);
      }
    },
    [navigate],
  );

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" aria-hidden />
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
                      isRunning={runningTaskId === task.id}
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
        taskId={newTaskOpen ? undefined : (editTaskId ?? undefined)}
        onTaskSaved={() => void refresh()}
      />
    </>
  );
}
