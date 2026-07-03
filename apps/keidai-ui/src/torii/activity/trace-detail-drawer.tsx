import {
  Badge,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  cn,
} from "@keidai/ui";
import type { TraceListItem } from "@keidai/shared";
import { TRACE_OUTCOME_META } from "./utils/format-trace-outcome.js";
import {
  formatTraceClock,
  formatDurationMs,
} from "./utils/format-trace-time.js";

export function TraceDetailDrawer({
  trace,
  open,
  onOpenChange,
}: {
  trace: TraceListItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (!trace) {
    return null;
  }

  const meta = TRACE_OUTCOME_META[trace.outcome];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full max-w-[560px] sm:max-w-[560px]">
        <SheetHeader className="space-y-3 text-left">
          <div className="flex items-start gap-3">
            <Badge
              variant="outline"
              className={cn("gap-1 font-normal", meta.badgeClass)}
            >
              {meta.label}
            </Badge>
            <div className="min-w-0 flex-1">
              <SheetTitle className="font-mono text-base">
                {trace.tool}
              </SheetTitle>
              <SheetDescription className="font-mono text-xs">
                {trace.server} · {formatTraceClock(trace.timestamp)}
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <div className="mt-6 space-y-4 text-sm">
          <div className="rounded-lg border border-border bg-muted/30 px-3 py-2">
            <div className="text-[10.5px] font-semibold tracking-wider text-muted-foreground uppercase">
              trace id
            </div>
            <div className="mt-1 truncate font-mono text-xs">{trace.traceId}</div>
          </div>

          <dl className="grid grid-cols-2 gap-3 text-xs">
            <div className="rounded-lg border border-border p-3">
              <dt className="font-mono text-muted-foreground">agentId</dt>
              <dd className="mt-1 font-mono font-semibold">
                {trace.principal?.agentId ?? "—"}
              </dd>
            </div>
            <div className="rounded-lg border border-border p-3">
              <dt className="font-mono text-muted-foreground">ownerId</dt>
              <dd className="mt-1 font-mono font-semibold">
                {trace.principal?.ownerId ?? "—"}
              </dd>
            </div>
            <div className="rounded-lg border border-border p-3">
              <dt className="font-mono text-muted-foreground">policy</dt>
              <dd className="mt-1 font-mono font-semibold">
                {trace.policyDecision}
              </dd>
            </div>
            <div className="rounded-lg border border-border p-3">
              <dt className="font-mono text-muted-foreground">duration</dt>
              <dd className="mt-1 font-mono font-semibold">
                {formatDurationMs(trace.durationMs)}
              </dd>
            </div>
          </dl>

          {trace.error ? (
            <div className="rounded-lg border border-border p-3">
              <div className="text-[10.5px] font-semibold tracking-wider text-muted-foreground uppercase">
                error
              </div>
              <p className="mt-1 font-mono text-xs text-destructive">
                {trace.error}
              </p>
            </div>
          ) : null}

          <p className="text-xs text-muted-foreground">
            Full timeline, policy rules, and credential resolution detail ship in
            a follow-up.
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
