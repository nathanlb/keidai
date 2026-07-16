import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  cn,
  Textarea,
} from "@keidai/ui";
import type { RunReport, RunStep } from "@keidai/shared";
import {
  CheckCircle2,
  CircleX,
  ExternalLink,
  Loader2,
  MessageSquare,
  Pause,
  Play,
  RotateCw,
  Send,
  Timer,
  UserX,
  Wrench,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useCallback, useEffect, useId, useState } from "react";
import {
  approveApproval,
  rejectApproval,
} from "../../torii/api/torii-client.js";
import { sendRunFollowUp } from "../api/shaiden-client.js";
import { DetailDrawer } from "../../shell/components/detail-drawer/detail-drawer.js";
import {
  canSendFollowUp,
  deriveRunDisplayStatus,
  isRunSuspended,
} from "./utils/derive-run-display-status.js";
import {
  formatRunStepDescription,
  formatRunStepMeta,
  formatRunStepTitle,
} from "./utils/format-run-step.js";
import { RUN_STATUS_META } from "./utils/format-run-status.js";
import {
  formatRunDuration,
  formatRunIterations,
} from "./utils/format-run-time.js";

function StepIcon({ step }: { step: RunStep }) {
  const className = "size-3.5 shrink-0";
  switch (step.kind) {
    case "model":
      return (
        <MessageSquare
          className={cn(className, "text-muted-foreground")}
          aria-hidden
        />
      );
    case "tool_dispatch":
      return <Wrench className={cn(className, "text-success")} aria-hidden />;
    case "tool_result":
      return (
        <Wrench
          className={cn(
            className,
            step.status === "error" ? "text-destructive" : "text-success",
          )}
          aria-hidden
        />
      );
    case "waiting_approval":
      return <Pause className={cn(className, "text-warning")} aria-hidden />;
    case "user_message":
      return (
        <MessageSquare className={cn(className, "text-primary")} aria-hidden />
      );
    case "outcome":
      return (
        <CheckCircle2
          className={cn(className, "text-muted-foreground")}
          aria-hidden
        />
      );
  }
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

function pendingApprovalId(run: RunReport): string | undefined {
  const waitingStep = [...run.steps]
    .reverse()
    .find((step) => step.kind === "waiting_approval");
  return waitingStep?.approvalId;
}

export function RunDetailDrawer({
  run,
  open,
  onOpenChange,
  onRunUpdated,
}: {
  run: RunReport | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRunUpdated: () => void;
}) {
  const [isDeciding, setIsDeciding] = useState(false);
  const [followUpMessage, setFollowUpMessage] = useState("");
  const [isSendingFollowUp, setIsSendingFollowUp] = useState(false);
  const [followUpError, setFollowUpError] = useState<string | null>(null);
  const followUpFieldId = useId();
  const followUpErrorId = useId();

  useEffect(() => {
    setFollowUpMessage("");
    setFollowUpError(null);
    setIsSendingFollowUp(false);
  }, [run?.id]);

  const handleSendFollowUp = useCallback(async () => {
    if (!run) {
      return;
    }

    const message = followUpMessage.trim();
    if (!message) {
      return;
    }

    setIsSendingFollowUp(true);
    setFollowUpError(null);
    try {
      await sendRunFollowUp(run.id, message);
      setFollowUpMessage("");
      onRunUpdated();
    } catch (error) {
      setFollowUpError(
        error instanceof Error ? error.message : "Could not send follow-up",
      );
    } finally {
      setIsSendingFollowUp(false);
    }
  }, [followUpMessage, onRunUpdated, run]);

  const handleApprove = useCallback(async () => {
    if (!run) {
      return;
    }

    const approvalId = pendingApprovalId(run);
    if (!approvalId) {
      return;
    }

    setIsDeciding(true);
    try {
      await approveApproval(approvalId);
      onRunUpdated();
    } finally {
      setIsDeciding(false);
    }
  }, [onRunUpdated, run]);

  const handleReject = useCallback(async () => {
    if (!run) {
      return;
    }

    const approvalId = pendingApprovalId(run);
    if (!approvalId) {
      return;
    }

    setIsDeciding(true);
    try {
      await rejectApproval(approvalId);
      onRunUpdated();
    } finally {
      setIsDeciding(false);
    }
  }, [onRunUpdated, run]);

  if (!run) {
    return null;
  }

  const status = deriveRunDisplayStatus(run, { steps: run.steps });
  const meta = RUN_STATUS_META[status];
  const suspended = isRunSuspended(run.steps);
  const followUpEnabled = canSendFollowUp(run, run.steps);

  return (
    <DetailDrawer
      open={open}
      onOpenChange={onOpenChange}
      headerBadge={
        <Badge
          variant="outline"
          className={cn("mt-0.5 gap-1 font-normal", meta.badgeClass)}
        >
          <StatusIcon status={status} />
          {meta.label}
        </Badge>
      }
      title={run.goalPreview}
      description={
        <span className="font-mono">
          {run.id} · {run.assignee} ·{" "}
          <Link
            to={`/shaiden/tasks?task=${encodeURIComponent(run.taskId)}`}
            className="text-primary hover:underline"
          >
            task {run.taskId}
          </Link>
        </span>
      }
      bodyClassName="space-y-4"
    >
      {run.outcome?.status === "failed" ? (
        <Alert variant="destructive">
          <CircleX className="size-4" />
          <AlertTitle>Run failed</AlertTitle>
          <AlertDescription className="text-destructive/90">
            {run.outcome.reason}
          </AlertDescription>
        </Alert>
      ) : null}

      {suspended ? (
        <>
          <Alert variant="warning">
            <Pause className="size-4" />
            <AlertTitle>Awaiting human review</AlertTitle>
            <AlertDescription>
              Parked on a gated tool call. Approve to resume the run or reject
              to terminate it.
            </AlertDescription>
          </Alert>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              disabled={isDeciding}
              onClick={() => void handleReject()}
            >
              Reject
            </Button>
            <Button
              type="button"
              className="flex-1"
              disabled={isDeciding}
              onClick={() => void handleApprove()}
            >
              Approve
            </Button>
          </div>
        </>
      ) : null}

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-border px-3.5 py-3">
          <div className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
            Iterations
          </div>
          <div className="mt-1 font-mono text-[15px] font-semibold">
            {formatRunIterations(run, run.steps)}
          </div>
        </div>
        <div className="rounded-lg border border-border px-3.5 py-3">
          <div className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
            Duration
          </div>
          <div className="mt-1 font-mono text-[15px] font-semibold">
            {formatRunDuration(run, run.steps)}
          </div>
        </div>
      </div>

      <div>
        <div className="mb-2.5 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
          Run log
        </div>
        <div className="divide-y divide-border rounded-lg border border-border">
          {run.steps.map((step) => (
            <div key={step.id} className="min-w-0 px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2.5">
                  <StepIcon step={step} />
                  <div className="truncate text-[13px] font-medium">
                    {formatRunStepTitle(step)}
                  </div>
                </div>
                {formatRunStepMeta(step) ? (
                  <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                    {formatRunStepMeta(step)}
                  </span>
                ) : null}
              </div>
              <p
                className={cn(
                  "mt-1 pl-[22px] text-[12.5px] leading-normal wrap-break-word",
                  step.kind === "tool_result" && step.status === "error"
                    ? "text-destructive"
                    : "text-muted-foreground",
                )}
              >
                {formatRunStepDescription(step)}
              </p>
              {step.kind === "tool_result" && step.traceId ? (
                <Link
                  to={`/activity?trace_id=${encodeURIComponent(step.traceId)}`}
                  className="mt-1 inline-flex items-center gap-1 pl-[22px] text-[11px] text-primary hover:underline"
                >
                  <ExternalLink className="size-3" aria-hidden />
                  View trace in Torii
                </Link>
              ) : null}
            </div>
          ))}
          {status === "running" ? (
            <div
              className="flex items-center gap-2.5 px-4 py-3 text-[13px] text-muted-foreground"
              aria-live="polite"
            >
              <Loader2 className="size-3.5 shrink-0 animate-spin" aria-hidden />
              Running…
            </div>
          ) : null}
        </div>
      </div>

      {followUpEnabled ? (
        <div className="space-y-2 border-t border-border pt-4">
          <label
            htmlFor={followUpFieldId}
            className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase"
          >
            Follow-up
          </label>
          <Textarea
            id={followUpFieldId}
            value={followUpMessage}
            onChange={(event) => setFollowUpMessage(event.target.value)}
            placeholder="Add guidance, ask for a summary, or suggest a retry…"
            rows={3}
            disabled={isSendingFollowUp}
            aria-invalid={followUpError ? true : undefined}
            aria-describedby={followUpError ? followUpErrorId : undefined}
          />
          {followUpError ? (
            <p id={followUpErrorId} className="text-[12px] text-destructive">
              {followUpError}
            </p>
          ) : null}
          <Button
            type="button"
            className="w-full"
            disabled={isSendingFollowUp || followUpMessage.trim().length === 0}
            onClick={() => void handleSendFollowUp()}
          >
            <Send className="size-3.5" aria-hidden />
            Send follow-up
          </Button>
        </div>
      ) : null}
    </DetailDrawer>
  );
}
