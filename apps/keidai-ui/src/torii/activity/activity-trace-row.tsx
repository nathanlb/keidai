import { Badge, cn, TableCell, TableRow } from "@keidai/ui";
import type { TraceListItem } from "@keidai/shared";
import {
  Ban,
  CircleCheck,
  Link2,
  TriangleAlert,
} from "lucide-react";
import { OwnerAvatar } from "../agents/owner-avatar.js";
import { TRACE_OUTCOME_META } from "./utils/format-trace-outcome.js";
import {
  formatTracePolicyShort,
  policyTextClass,
} from "./utils/format-trace-policy.js";
import {
  formatDurationMs,
  formatTraceClock,
  formatTraceRelative,
} from "./utils/format-trace-time.js";

function agentInitials(agentId: string): string {
  const parts = agentId.split(/[-_]/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
  }
  return agentId.slice(0, 2).toUpperCase();
}

function OutcomeIcon({ outcome }: { outcome: TraceListItem["outcome"] }) {
  switch (outcome) {
    case "success":
      return <CircleCheck className="size-3" aria-hidden />;
    case "error":
      return <TriangleAlert className="size-3" aria-hidden />;
    case "denied":
      return <Ban className="size-3" aria-hidden />;
    case "linking_required":
      return <Link2 className="size-3" aria-hidden />;
  }
}

export function ActivityTraceRow({
  trace,
  onOpen,
}: {
  trace: TraceListItem;
  onOpen: (trace: TraceListItem) => void;
}) {
  const meta = TRACE_OUTCOME_META[trace.outcome];

  return (
    <TableRow
      className="cursor-pointer border-border hover:bg-muted/30"
      onClick={() => onOpen(trace)}
    >
      <TableCell className="w-0 p-0">
        <span
          className={cn("block min-h-[46px] w-[3px]", meta.accentClass)}
          aria-hidden
        />
      </TableCell>
      <TableCell className="py-3 pl-3.5 whitespace-nowrap">
        <div className="font-mono text-[12.5px] text-foreground">
          {formatTraceClock(trace.timestamp)}
        </div>
        <div className="text-[11px] text-muted-foreground">
          {formatTraceRelative(trace.timestamp)}
        </div>
      </TableCell>
      <TableCell className="py-3">
        <Badge
          variant="outline"
          className={cn("gap-1 font-normal", meta.badgeClass)}
        >
          <OutcomeIcon outcome={trace.outcome} />
          {meta.label}
        </Badge>
      </TableCell>
      <TableCell className="py-3">
        <div className="font-mono text-[13px] font-semibold">{trace.tool}</div>
        <div className="font-mono text-[11.5px] text-muted-foreground">
          {trace.server}
        </div>
      </TableCell>
      <TableCell className="py-3">
        {trace.principal ? (
          <div className="flex items-center gap-2">
            <OwnerAvatar
              initials={agentInitials(trace.principal.agentId)}
              className="size-[22px] bg-secondary text-[9px] text-secondary-foreground"
            />
            <div className="min-w-0 leading-tight">
              <div className="font-mono text-xs">{trace.principal.agentId}</div>
              <div className="text-[11px] text-muted-foreground">
                as {trace.principal.ownerId}
              </div>
            </div>
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell
        className={cn(
          "py-3 font-mono text-xs whitespace-nowrap",
          policyTextClass(trace),
        )}
      >
        {formatTracePolicyShort(trace)}
      </TableCell>
      <TableCell className="py-3 pr-[18px] text-right font-mono text-xs text-muted-foreground">
        {formatDurationMs(trace.durationMs)}
      </TableCell>
    </TableRow>
  );
}
