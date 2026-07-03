import {
  Badge,
  Button,
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  cn,
} from "@keidai/ui";
import type { PublicServerConfig } from "@keidai/shared/dto";
import type { TraceListItem } from "@keidai/shared";
import {
  Ban,
  Check,
  Copy,
  Link2,
  ShieldCheck,
  X,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { deriveOwnerInitials } from "../../shell/utils/derive-owner-initials.js";
import { OwnerAvatar } from "../agents/owner-avatar.js";
import { buildTraceSpans } from "./utils/build-trace-spans.js";
import {
  formatCredentialProvider,
  formatCredentialRef,
  formatCredentialStrategy,
  formatLinkingReason,
  resolveLinkProviderId,
} from "./utils/format-trace-credential.js";
import { TRACE_OUTCOME_META } from "./utils/format-trace-outcome.js";
import { formatTracePolicyDetail } from "./utils/format-trace-policy-detail.js";
import {
  formatTraceClock,
  formatTraceRelative,
} from "./utils/format-trace-time.js";

function deriveAgentMonogram(agentId: string): string {
  const parts = agentId
    .split(/[-_]/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length >= 2) {
    return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
  }

  return agentId.slice(0, 2).toUpperCase();
}

function SectionLabel({
  children,
  hint,
}: {
  children: string;
  hint?: string;
}) {
  return (
    <div className="mb-2.5 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
      {children}
      {hint ? (
        <span className="ml-1 font-medium tracking-normal text-muted-foreground normal-case">
          · {hint}
        </span>
      ) : null}
    </div>
  );
}

export function TraceDetailDrawer({
  trace,
  server,
  open,
  onOpenChange,
  onLinkProvider,
}: {
  trace: TraceListItem | null;
  server?: PublicServerConfig;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLinkProvider?: (providerId: string, ownerId: string) => void;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setCopied(false);
  }, [trace?.traceId]);

  const copyTraceId = useCallback(async () => {
    if (!trace) {
      return;
    }

    try {
      await navigator.clipboard.writeText(trace.traceId);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1_300);
    } catch {
      setCopied(false);
    }
  }, [trace]);

  if (!trace) {
    return null;
  }

  const meta = TRACE_OUTCOME_META[trace.outcome];
  const { spans, totalMs } = buildTraceSpans(trace, server);
  const policy = formatTracePolicyDetail(trace, server);
  const linkingReason = formatLinkingReason(trace, server);
  const linkProviderId = resolveLinkProviderId(trace, server);
  const ownerId = trace.principal?.ownerId;
  const agentId = trace.principal?.agentId;
  const policyDenied = policy.variant === "denied";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex h-full w-full max-w-[560px] flex-col gap-0 p-0 sm:max-w-[560px]"
      >
        <SheetHeader className="space-y-0 border-b border-border px-5 py-[18px] text-left">
          <div className="flex items-start gap-3 pr-8">
            <Badge
              variant="outline"
              className={cn("mt-0.5 gap-1 font-normal", meta.badgeClass)}
            >
              {meta.label}
            </Badge>
            <div className="min-w-0 flex-1">
              <SheetTitle className="font-mono text-base">
                {trace.tool}
              </SheetTitle>
              <SheetDescription className="font-mono text-xs">
                {trace.server} · {formatTraceClock(trace.timestamp)} ·{" "}
                {formatTraceRelative(trace.timestamp)}
              </SheetDescription>
            </div>
            <SheetClose className="absolute top-4 right-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:outline-none">
              <X className="size-4" />
              <span className="sr-only">Close</span>
            </SheetClose>
          </div>
        </SheetHeader>

        <div className="flex-1 space-y-[22px] overflow-y-auto px-5 py-[18px]">
          <div className="flex items-center gap-2.5 rounded-lg border border-border bg-muted/30 px-2.5 py-2 pl-3.5">
            <span className="shrink-0 text-[10.5px] font-semibold tracking-wider text-muted-foreground uppercase">
              trace id
            </span>
            <span className="min-w-0 flex-1 truncate font-mono text-[12.5px]">
              {trace.traceId}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="shrink-0 gap-1.5"
              onClick={() => void copyTraceId()}
            >
              {copied ? (
                <Check className="size-3.5" aria-hidden />
              ) : (
                <Copy className="size-3.5" aria-hidden />
              )}
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>

          <div>
            <div className="mb-2.5 flex items-baseline justify-between">
              <SectionLabel>Trace timeline</SectionLabel>
              <div className="font-mono text-[11.5px] text-muted-foreground">
                {totalMs}ms total
              </div>
            </div>
            <div className="flex flex-col gap-2">
              {spans.map((span) => (
                <div
                  key={span.label}
                  className="grid grid-cols-[142px_1fr_52px] items-center gap-2.5"
                >
                  <span
                    className={cn(
                      "truncate font-mono text-[11.5px]",
                      span.labelClass,
                    )}
                  >
                    {span.label}
                  </span>
                  <div className="relative h-[9px] rounded-sm bg-muted/55">
                    <span
                      className={cn(
                        "absolute top-0 bottom-0 rounded-sm",
                        span.barClass,
                      )}
                      style={{
                        left: span.leftPct,
                        width: span.widthPct,
                      }}
                    />
                  </div>
                  <span className="text-right font-mono text-[11px] text-muted-foreground">
                    {span.durLabel}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <SectionLabel hint="who acted">Principal</SectionLabel>
            <div className="grid grid-cols-2 gap-2.5">
              <div className="rounded-lg border border-border p-3">
                <div className="font-mono text-[11px] text-muted-foreground">
                  agentId
                </div>
                <div className="mt-1.5 flex items-center gap-2">
                  <OwnerAvatar
                    initials={agentId ? deriveAgentMonogram(agentId) : "—"}
                    className="size-[22px] bg-secondary text-[9px] text-secondary-foreground"
                  />
                  <span className="font-mono text-[13px] font-semibold">
                    {agentId ?? "—"}
                  </span>
                </div>
              </div>
              <div className="rounded-lg border border-border p-3">
                <div className="font-mono text-[11px] text-muted-foreground">
                  ownerId
                </div>
                <div className="mt-1.5 flex items-center gap-2">
                  <OwnerAvatar
                    initials={ownerId ? deriveOwnerInitials(ownerId) : "—"}
                    className="size-[22px] text-[9px]"
                  />
                  <span className="font-mono text-[13px] font-semibold">
                    {ownerId ?? "—"}
                  </span>
                </div>
              </div>
            </div>
            <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
              Strict ownership — the agent is bound to this owner at
              registration; the resolved{" "}
              <span className="font-mono">owner_id</span> selected the grant used
              below.
            </p>
          </div>

          <div>
            <SectionLabel>Policy decision</SectionLabel>
            <div
              className={cn(
                "rounded-lg border p-3.5",
                policyDenied
                  ? "border-destructive/40 bg-destructive/8"
                  : "border-border",
              )}
            >
              <div className="flex items-center gap-2">
                {policyDenied ? (
                  <Ban className="size-[15px] text-destructive" aria-hidden />
                ) : (
                  <ShieldCheck
                    className={cn(
                      "size-[15px]",
                      trace.outcome === "success"
                        ? "text-success"
                        : "text-muted-foreground",
                    )}
                    aria-hidden
                  />
                )}
                <span
                  className={cn(
                    "text-[13.5px] font-semibold",
                    policyDenied
                      ? "text-destructive"
                      : trace.outcome === "success"
                        ? "text-success"
                        : "text-foreground",
                  )}
                >
                  {policy.headline}
                </span>
              </div>
              <p className="mt-1.5 text-[12.5px] leading-normal text-muted-foreground">
                {policy.reason}
              </p>
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                <Badge
                  variant="outline"
                  className="font-mono text-[11px] font-normal"
                >
                  default: {policy.policyDefault}
                </Badge>
                {policy.matchedRule ? (
                  <Badge
                    variant="outline"
                    className="font-mono text-[11px] font-normal"
                  >
                    matched: {policy.matchedRule}
                  </Badge>
                ) : null}
              </div>
            </div>
          </div>

          <div>
            <SectionLabel>Credential resolution</SectionLabel>
            <div className="flex flex-col gap-2 rounded-lg border border-border p-3.5 text-[12.5px]">
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">credentialRef</span>
                <span className="max-w-[300px] truncate text-right font-mono">
                  {formatCredentialRef(trace)}
                </span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">strategy</span>
                <span className="font-mono">
                  {formatCredentialStrategy(server)}
                </span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">provider</span>
                <span className="font-mono">
                  {formatCredentialProvider(server)}
                </span>
              </div>
            </div>
            {linkingReason && linkProviderId && ownerId && onLinkProvider ? (
              <div className="mt-2.5 flex items-center gap-3 rounded-lg border border-warning/40 bg-warning/8 p-3">
                <p className="flex-1 text-[12.5px] leading-snug text-foreground">
                  {linkingReason}
                </p>
                <Button
                  type="button"
                  size="sm"
                  className="shrink-0 gap-1.5"
                  onClick={() => onLinkProvider(linkProviderId, ownerId)}
                >
                  <Link2 className="size-3.5" aria-hidden />
                  Link
                </Button>
              </div>
            ) : linkingReason ? (
              <p className="mt-2.5 rounded-lg border border-warning/40 bg-warning/8 p-3 text-[12.5px] leading-snug text-foreground">
                {linkingReason}
              </p>
            ) : null}
          </div>

          {trace.error ? (
            <div>
              <SectionLabel>Backend error</SectionLabel>
              <pre className="overflow-x-auto rounded-lg border border-destructive/35 bg-destructive/8 p-3.5 font-mono text-xs leading-normal whitespace-pre-wrap text-destructive">
                {trace.error}
              </pre>
            </div>
          ) : null}
        </div>

        <SheetFooter className="flex-row justify-between border-t border-border px-5 py-3.5 sm:justify-between">
          <Button
            type="button"
            variant="outline"
            className="gap-1.5"
            onClick={() => void copyTraceId()}
          >
            {copied ? (
              <Check className="size-3.5" aria-hidden />
            ) : (
              <Copy className="size-3.5" aria-hidden />
            )}
            Copy trace id
          </Button>
          <SheetClose asChild>
            <Button type="button">Close</Button>
          </SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
