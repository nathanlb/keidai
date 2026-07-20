import type { ApprovalRecordView } from "@keidai/shared";
import {
  Badge,
  Button,
  Card,
  Separator,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@keidai/ui";
import {
  CheckCheck,
  ChevronDown,
  ChevronUp,
  CornerDownRight,
  MessageSquare,
  TriangleAlert,
} from "lucide-react";
import { useState, type MouseEvent } from "react";
import { useFetchRun } from "../../shell/hooks/use-fetch-run.js";
import { ApprovalActions } from "./approval-actions.js";
import { ApprovalCapturedCall } from "./approval-captured-call.js";
import { ConnectionLogo } from "./connection-logo.js";
import { deriveApprovalDisplay } from "./utils/derive-approval-display.js";
import { formatParkedDuration } from "./utils/format-parked-duration.js";

interface ApprovalCardProps {
  approval: ApprovalRecordView;
  expanded: boolean;
  onToggle: () => void;
  onApprove: (id: string) => Promise<void>;
  onReject: (id: string, reason?: string) => Promise<void>;
  onCancel: (id: string) => Promise<void>;
}

export function ApprovalCard({
  approval,
  expanded,
  onToggle,
  onApprove,
  onReject,
  onCancel,
}: ApprovalCardProps) {
  const [busy, setBusy] = useState(false);
  const { data: run } = useFetchRun(expanded && approval.runId ? approval.runId : null);
  const display = deriveApprovalDisplay(approval, run);
  const parkedLabel = formatParkedDuration(approval.createdAt);

  const handleQuickApprove = async (event: MouseEvent) => {
    event.stopPropagation();
    setBusy(true);
    try {
      await onApprove(approval.id);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="overflow-hidden rounded-[14px] py-0 shadow-none">
      <div className="flex w-full items-start gap-3 px-[15px] py-[18px]">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-start gap-3 text-left"
          onClick={onToggle}
        >
          <ConnectionLogo server={display.server} />

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span className="font-mono text-[14.5px] font-bold">{display.tool}</span>
              <span className="text-[12px] text-muted-foreground">
                {display.connectionLabel}
              </span>
            </div>
            <div className="mt-0.5 flex min-w-0 items-center gap-1 text-[12px] text-muted-foreground">
              <CornerDownRight className="size-3 shrink-0" />
              <span className="truncate">
                {display.taskName ?? "Parked run"}
              </span>
              {approval.runId ? (
                <>
                  <span aria-hidden>·</span>
                  <span className="truncate font-mono">{approval.runId}</span>
                </>
              ) : null}
            </div>
          </div>
        </button>

        <div className="flex shrink-0 items-center gap-2">
          <Badge
            variant="outline"
            className="gap-1 border-border bg-muted/50 text-[11px] font-normal text-muted-foreground"
          >
            <TriangleAlert className="size-3" />
            Gated tool call
          </Badge>
          <span className="font-mono text-[12px] text-muted-foreground">
            {parkedLabel}
          </span>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                size="icon"
                className="size-[26px] shrink-0"
                disabled={busy}
                onClick={handleQuickApprove}
                aria-label="Approve and resume"
              >
                <CheckCheck className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="left">Approve & resume</TooltipContent>
          </Tooltip>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8 text-muted-foreground"
            onClick={onToggle}
            aria-label={expanded ? "Collapse approval" : "Expand approval"}
          >
            {expanded ? (
              <ChevronUp className="size-4" />
            ) : (
              <ChevronDown className="size-4" />
            )}
          </Button>
        </div>
      </div>

      {expanded ? (
        <>
          <Separator />
          <div className="flex flex-col gap-4 px-[18px] pb-[18px] pt-[15px]">
            {display.reasoning ? (
              <div className="rounded-lg border border-border bg-muted/30 p-3">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <MessageSquare className="size-3.5" />
                  Why the agent wants this
                </div>
                <p className="mt-2 text-[13px] leading-relaxed">{display.reasoning}</p>
              </div>
            ) : null}

            <div className="flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-muted-foreground">
              <span>
                Agent{" "}
                <span className="font-mono text-foreground">{approval.agentId}</span>
              </span>
              <span>
                Connection{" "}
                <span className="font-mono text-foreground">{display.server}</span>
              </span>
              <span>
                Parked{" "}
                <span className="font-mono text-foreground">{parkedLabel}</span> ago
              </span>
              {display.iterationCurrent !== undefined ? (
                <span>
                  Iteration{" "}
                  <span className="font-mono text-foreground">
                    {display.iterationCurrent}
                  </span>
                </span>
              ) : null}
            </div>

            <ApprovalCapturedCall
              toolName={approval.toolName}
              params={approval.params}
            />

            <ApprovalActions
              disabled={busy}
              onApprove={() => onApprove(approval.id)}
              onReject={(reason) => onReject(approval.id, reason)}
              onCancel={() => onCancel(approval.id)}
            />
          </div>
        </>
      ) : null}
    </Card>
  );
}
