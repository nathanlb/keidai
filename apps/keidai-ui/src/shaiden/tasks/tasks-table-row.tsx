import { Button, TableCell, TableRow } from "@keidai/ui";
import type { SavedTask } from "@keidai/shared";
import { Loader2, Pencil, Play } from "lucide-react";
import { Link } from "react-router-dom";
import { OwnerAvatar } from "../../torii/agents/owner-avatar.js";
import { taskEditHref } from "../navigation.js";

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
      <TableCell className="max-w-0 py-3 pl-[18px]">
        <div className="truncate text-[13px] font-semibold" title={task.goal}>
          {task.goal}
        </div>
        <Link
          to={taskEditHref(task.id)}
          className="mt-0.5 block truncate font-mono text-[11.5px] text-muted-foreground hover:text-foreground"
          title={task.id}
        >
          {task.id}
        </Link>
      </TableCell>
      <TableCell className="max-w-0 py-3">
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
      <TableCell className="py-3 whitespace-nowrap font-mono text-[12.5px] text-muted-foreground">
        {formatUpdatedAt(task.updatedAt)}
      </TableCell>
      <TableCell className="py-3 pr-[18px] text-right">
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
