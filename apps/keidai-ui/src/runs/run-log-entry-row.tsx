import { cn } from "@keidai/ui";
import type { RunStep } from "@keidai/shared";
import {
  CheckCircle2,
  ExternalLink,
  FileOutput,
  Loader2,
  MessageSquare,
  Pause,
  Wrench,
} from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router";
import {
  formatRunStepDescription,
  formatRunStepMeta,
  formatRunStepTitle,
} from "./utils/format-run-step.js";
import {
  formatToolCallDuration,
  formatToolCallOutcome,
  formatToolResultBody,
  formatToolResultEyebrow,
  type GroupedRunLogEntry,
  type GroupedToolCallEntry,
} from "./utils/group-run-steps.js";

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
    case "output":
      return (
        <FileOutput className={cn(className, "text-primary")} aria-hidden />
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

function StepRowShell({ children }: { children: ReactNode }) {
  return <div className="min-w-0 px-4 py-3">{children}</div>;
}

function StepDescription({
  children,
  className,
}: {
  children: string;
  className?: string;
}) {
  return (
    <p className={cn("text-[12.5px] leading-normal wrap-break-word", className)}>
      {children}
    </p>
  );
}

function ToriiTraceLink({
  traceId,
  className,
}: {
  traceId: string;
  className?: string;
}) {
  return (
    <Link
      to={`/activity?trace_id=${encodeURIComponent(traceId)}`}
      className={cn(
        "inline-flex items-center gap-1 text-[11px] text-primary hover:underline",
        className,
      )}
    >
      <ExternalLink className="size-3" aria-hidden />
      View trace in Torii
    </Link>
  );
}

function PlainStepRow({ step }: { step: RunStep }) {
  const description = formatRunStepDescription(step);
  const meta = formatRunStepMeta(step);
  const isOutput = step.kind === "output";
  const isErrorResult = step.kind === "tool_result" && step.status === "error";

  return (
    <StepRowShell>
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <StepIcon step={step} />
          <div className="truncate text-[13px] font-medium">
            {formatRunStepTitle(step)}
          </div>
        </div>
        {meta ? (
          <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
            {meta}
          </span>
        ) : null}
      </div>

      <StepDescription
        className={cn(
          "mt-1 pl-5.5",
          isOutput && "whitespace-pre-wrap text-foreground",
          isErrorResult
            ? "text-destructive"
            : !isOutput && "text-muted-foreground",
        )}
      >
        {description}
      </StepDescription>

      {step.kind === "tool_result" && step.traceId ? (
        <ToriiTraceLink traceId={step.traceId} className="mt-1 pl-5.5" />
      ) : null}
    </StepRowShell>
  );
}

function ToolCallPendingStatus() {
  return (
    <span className="ml-auto inline-flex items-center gap-2 text-[11px] text-muted-foreground">
      <Loader2 className="size-3.5 shrink-0 animate-spin" aria-hidden />
      <span className="run-log-breathe">running</span>
    </span>
  );
}

function ToolCallSettledStatus({
  entry,
  isError,
}: {
  entry: GroupedToolCallEntry;
  isError: boolean;
}) {
  return (
    <span className="ml-auto inline-flex items-center gap-3.5 font-mono text-[11px]">
      {entry.durationMs !== undefined ? (
        <span className="text-muted-foreground">
          {formatToolCallDuration(entry.durationMs)}
        </span>
      ) : null}
      <span className={cn(isError ? "text-destructive" : "text-success")}>
        {formatToolCallOutcome(entry.status)}
      </span>
    </span>
  );
}

function ToolCallPendingResult() {
  return (
    <div
      className="mt-1 flex flex-col gap-2 border-t border-border/80 pt-3"
      aria-hidden
    >
      <div className="run-log-shimmer h-3 w-[72%] rounded-[3px]" />
      <div className="h-3 w-[44%] rounded-[3px] bg-muted" />
    </div>
  );
}

function ToolCallSettledResult({
  entry,
  isError,
}: {
  entry: GroupedToolCallEntry;
  isError: boolean;
}) {
  const eyebrow = formatToolResultEyebrow(entry);
  const body = formatToolResultBody(entry);

  return (
    <div
      className={cn(
        "run-log-result-enter mt-1 flex flex-col gap-2 border-t pt-3",
        isError ? "border-destructive/25" : "border-border/80",
      )}
    >
      <div
        className={cn(
          "text-[11px] tracking-[0.06em] uppercase",
          isError ? "text-destructive" : "text-muted-foreground",
        )}
      >
        {eyebrow}
      </div>
      <StepDescription
        className={cn(
          "break-all line-clamp-3",
          isError ? "text-destructive/80" : "text-foreground/80",
        )}
      >
        {body}
      </StepDescription>
      {entry.result?.traceId ? (
        <ToriiTraceLink
          traceId={entry.result.traceId}
          className="mt-0.5 gap-1.5 text-foreground/80 hover:text-primary"
        />
      ) : null}
    </div>
  );
}

function ToolCallStepRow({ entry }: { entry: GroupedToolCallEntry }) {
  const isError = entry.status === "error";
  const isPending = entry.status === "pending";
  const argumentsLine = formatRunStepDescription(entry.dispatch);

  return (
    <StepRowShell>
      <div className="grid grid-cols-[1.25rem_minmax(0,1fr)] gap-x-2.5">
        <div className="flex justify-center pt-0.5">
          <Wrench
            className={cn(
              "size-3.5 shrink-0",
              isError ? "text-destructive" : "text-success",
            )}
            aria-hidden
          />
        </div>

        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <div className="truncate text-[13px] font-medium">
              {formatRunStepTitle(entry.dispatch)}
            </div>
            {isPending ? (
              <ToolCallPendingStatus />
            ) : (
              <ToolCallSettledStatus entry={entry} isError={isError} />
            )}
          </div>

          <StepDescription className="break-all text-muted-foreground line-clamp-3">
            {argumentsLine}
          </StepDescription>

          {isPending ? (
            <ToolCallPendingResult />
          ) : (
            <ToolCallSettledResult entry={entry} isError={isError} />
          )}
        </div>
      </div>
    </StepRowShell>
  );
}

export function RunLogEntryRow({ entry }: { entry: GroupedRunLogEntry }) {
  if (entry.type === "tool_call") {
    return <ToolCallStepRow entry={entry} />;
  }

  return <PlainStepRow step={entry.step} />;
}

export function runLogEntryKey(entry: GroupedRunLogEntry): string {
  return entry.type === "tool_call" ? entry.id : entry.step.id;
}
