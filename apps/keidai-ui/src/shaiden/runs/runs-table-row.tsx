import { Badge, cn, TableCell, TableRow } from "@keidai/ui";
import type { RunListItem } from "@keidai/shared";
import {
  CheckCircle2,
  ChevronRight,
  CircleX,
  Pause,
  Play,
  RotateCw,
  Timer,
  UserX,
} from "lucide-react";
import { Link } from "react-router-dom";
import { OwnerAvatar } from "../../torii/agents/owner-avatar.js";
import { deriveRunDisplayStatus } from "./utils/derive-run-display-status.js";
import { RUN_STATUS_META } from "./utils/format-run-status.js";
import {
  formatRunClock,
  formatRunDuration,
  formatRunIterations,
  formatRunRelative,
} from "./utils/format-run-time.js";
import { runsTableColumns } from "./runs-table-columns.js";

function agentInitials(agentId: string): string {
  const parts = agentId.split(/[-_]/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
  }
  return agentId.slice(0, 2).toUpperCase();
}

function StatusIcon({
  status,
}: {
  status: ReturnType<typeof deriveRunDisplayStatus>;
}) {
  const className = "size-3";
  switch (status) {
    case "running":
      return <Play className={className} aria-hidden />;
    case "waiting_approval":
      return <Pause className={className} aria-hidden />;
    case "goal_met":
      return <CheckCircle2 className={className} aria-hidden />;
    case "failed":
      return <CircleX className={className} aria-hidden />;
    case "iteration_exhausted":
      return <RotateCw className={className} aria-hidden />;
    case "timeout":
      return <Timer className={className} aria-hidden />;
    case "human_reject":
      return <UserX className={className} aria-hidden />;
  }
}

export function RunsTableRow({
  run,
  suspendedRunIds,
  selected,
  onOpen,
}: {
  run: RunListItem;
  suspendedRunIds: ReadonlySet<string>;
  selected: boolean;
  onOpen: (runId: string) => void;
}) {
  const status = deriveRunDisplayStatus(run, { suspendedRunIds });
  const meta = RUN_STATUS_META[status];

  return (
    <TableRow
      data-state={selected ? "selected" : undefined}
      className="cursor-pointer border-border hover:bg-muted/30"
      onClick={() => onOpen(run.id)}
    >
      <TableCell
        className={runsTableColumns.cellClassName("run")}
        style={runsTableColumns.cellStyle("run")}
      >
        <div
          className="truncate text-[13px] font-semibold"
          title={run.goalPreview}
        >
          {run.goalPreview}
        </div>
        <div
          className="mt-0.5 truncate font-mono text-[11.5px] text-muted-foreground"
          title={run.id}
        >
          {run.id}
        </div>
        <Link
          to={`/shaiden/tasks?task=${encodeURIComponent(run.taskId)}`}
          className="mt-0.5 block truncate font-mono text-[11px] text-primary hover:underline"
          title={run.taskId}
          onClick={(event) => event.stopPropagation()}
        >
          task {run.taskId}
        </Link>
      </TableCell>
      <TableCell
        className={runsTableColumns.cellClassName("started")}
        style={runsTableColumns.cellStyle("started")}
      >
        <div className="truncate font-mono text-[12.5px] text-foreground">
          {formatRunClock(run.startedAt)}
        </div>
        <div className="truncate text-[11px] text-muted-foreground">
          {formatRunRelative(run.startedAt)}
        </div>
      </TableCell>
      <TableCell
        className={runsTableColumns.cellClassName("iterations")}
        style={runsTableColumns.cellStyle("iterations")}
      >
        {formatRunIterations(run)}
      </TableCell>
      <TableCell
        className={runsTableColumns.cellClassName("duration")}
        style={runsTableColumns.cellStyle("duration")}
      >
        {formatRunDuration(run)}
      </TableCell>
      <TableCell
        className={runsTableColumns.cellClassName("status")}
        style={runsTableColumns.cellStyle("status")}
      >
        <Badge
          variant="outline"
          className={cn("max-w-full gap-1 truncate font-normal", meta.badgeClass)}
        >
          <StatusIcon status={status} />
          <span className="truncate">{meta.label}</span>
        </Badge>
      </TableCell>
      <TableCell
        className={runsTableColumns.cellClassName("agent")}
        style={runsTableColumns.cellStyle("agent")}
      >
        <div className="flex min-w-0 items-center gap-2">
          <OwnerAvatar
            initials={agentInitials(run.assignee)}
            className="size-[22px] shrink-0 bg-secondary text-[9px] text-secondary-foreground"
          />
          <span className="truncate font-mono text-xs" title={run.assignee}>
            {run.assignee}
          </span>
        </div>
      </TableCell>
      <TableCell
        className={runsTableColumns.cellClassName("chevron")}
        style={runsTableColumns.cellStyle("chevron")}
      >
        <ChevronRight
          className="ml-auto size-3.5 shrink-0 text-muted-foreground"
          aria-hidden
        />
      </TableCell>
    </TableRow>
  );
}
