import { Button, TableCell, TableRow } from "@keidai/ui";
import type { SavedTask } from "@keidai/shared";
import { Loader2, Pencil, Play } from "lucide-react";
import { OwnerAvatar } from "../../shell/components/owner-avatar/owner-avatar.js";
import { tasksTableColumns } from "./tasks-table-columns.js";

function agentInitials(agentId: string): string {
  const parts = agentId.split(/[-_]/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
  }
  return agentId.slice(0, 2).toUpperCase();
}

function formatUpdatedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function TasksTableRow({
  task,
  isRunning,
  onEdit,
  onRun,
}: {
  task: SavedTask;
  isRunning: boolean;
  onEdit: () => void;
  onRun: () => void;
}) {
  return (
    <TableRow className="border-border hover:bg-muted/30">
      <TableCell
        className={tasksTableColumns.cellClassName("goal")}
        style={tasksTableColumns.cellStyle("goal")}
      >
        <div className="truncate text-[13px] font-semibold" title={task.goal}>
          {task.goal}
        </div>
        <div
          className="mt-0.5 block truncate font-mono text-[11.5px] text-muted-foreground"
          title={task.id}
        >
          {task.id}
        </div>
      </TableCell>
      <TableCell
        className={tasksTableColumns.cellClassName("assignee")}
        style={tasksTableColumns.cellStyle("assignee")}
      >
        <div className="flex min-w-0 items-center gap-2">
          <OwnerAvatar
            initials={agentInitials(task.assignee)}
            className="size-[22px] shrink-0 bg-secondary text-[9px] text-secondary-foreground"
          />
          <span className="truncate font-mono text-xs" title={task.assignee}>
            {task.assignee}
          </span>
        </div>
      </TableCell>
      <TableCell
        className={tasksTableColumns.cellClassName("updated")}
        style={tasksTableColumns.cellStyle("updated")}
      >
        {formatUpdatedAt(task.updatedAt)}
      </TableCell>
      <TableCell
        className={tasksTableColumns.cellClassName("actions")}
        style={tasksTableColumns.cellStyle("actions")}
      >
        <div className="flex justify-end gap-2">
          <Button type="button" size="sm" variant="ghost" onClick={onEdit}>
            <Pencil className="size-3.5" aria-hidden />
            Edit
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={isRunning}
            onClick={onRun}
          >
            {isRunning ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
            ) : (
              <Play className="size-3.5" aria-hidden />
            )}
            Run
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}
