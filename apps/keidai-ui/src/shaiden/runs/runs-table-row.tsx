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
import { OwnerAvatar } from "../../torii/agents/owner-avatar.js";
import { deriveRunDisplayStatus } from "./utils/derive-run-display-status.js";
import { RUN_STATUS_META } from "./utils/format-run-status.js";
import {
  formatRunClock,
  formatRunDuration,
  formatRunIterations,
  formatRunRelative,
} from "./utils/format-run-time.js";

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
      <TableCell className="max-w-0 py-3">
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
      </TableCell>
      <TableCell className="py-3 whitespace-nowrap">
        <div className="font-mono text-[12.5px] text-foreground">
          {formatRunClock(run.startedAt)}
        </div>
        <div className="text-[11px] text-muted-foreground">
          {formatRunRelative(run.startedAt)}
        </div>
      </TableCell>
      <TableCell className="py-3 font-mono text-xs">
        {formatRunIterations(run)}
      </TableCell>
      <TableCell className="py-3 text-right font-mono text-xs text-muted-foreground">
        {formatRunDuration(run)}
      </TableCell>
      <TableCell className="py-3">
        <Badge
          variant="outline"
          className={cn("gap-1 font-normal", meta.badgeClass)}
        >
          <StatusIcon status={status} />
          {meta.label}
        </Badge>
      </TableCell>
      <TableCell className="max-w-0 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <OwnerAvatar
            initials={agentInitials(run.assignee)}
            className="size-[22px] shrink-0 bg-secondary text-[9px] text-secondary-foreground"
          />
          <span
            className="truncate font-mono text-xs"
            title={run.assignee}
          >
            {run.assignee}
          </span>
        </div>
      </TableCell>
      <TableCell className="py-3 pr-[18px] text-right text-muted-foreground">
        <ChevronRight className="ml-auto size-4" aria-hidden />
      </TableCell>
    </TableRow>
  );
}
