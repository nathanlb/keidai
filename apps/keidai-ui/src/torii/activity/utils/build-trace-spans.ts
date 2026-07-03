import type { PublicServerConfig } from "@keidai/shared/dto";
import type { TraceListItem } from "@keidai/shared";

const SPAN_LABELS = {
  receive: "gateway.receive",
  principal: "principal.resolve",
  policy: "policy.evaluate",
  credential: "credential.resolve",
  backend: "backend.call",
  respond: "gateway.respond",
} as const;

type SpanKind = "norm" | "good" | "deny" | "fail" | "error";

export interface TraceSpanView {
  label: string;
  labelClass: string;
  barClass: string;
  leftPct: string;
  widthPct: string;
  durLabel: string;
}

function inferCredentialKind(
  server?: PublicServerConfig,
): "oauth" | "service" | "none" {
  switch (server?.credential.strategy) {
    case "user_oauth":
      return "oauth";
    case "service_key":
      return "service";
    default:
      return "none";
  }
}

function spanLabelClass(kind: SpanKind): string {
  switch (kind) {
    case "deny":
    case "fail":
    case "error":
      return "text-destructive";
    default:
      return "text-foreground";
  }
}

function spanBarClass(kind: SpanKind): string {
  switch (kind) {
    case "good":
      return "bg-success";
    case "deny":
    case "error":
      return "bg-destructive";
    case "fail":
      return "bg-warning";
    default:
      return "bg-muted-foreground/80";
  }
}

function formatSpanDuration(durationMs: number): string {
  if (durationMs < 1) {
    return "<1ms";
  }
  return `${durationMs}ms`;
}

export function buildTraceSpans(
  trace: TraceListItem,
  server?: PublicServerConfig,
): { spans: TraceSpanView[]; totalMs: number } {
  const credKind = inferCredentialKind(server);
  const rawSpans: { label: string; dur: number; kind: SpanKind }[] = [];

  const push = (
    key: keyof typeof SPAN_LABELS,
    dur: number,
    kind: SpanKind,
  ): void => {
    rawSpans.push({ label: SPAN_LABELS[key], dur, kind });
  };

  push("receive", 1, "norm");
  push("principal", 2, "norm");

  if (trace.policyDecision === "denied") {
    push("policy", 3, "deny");
    push("respond", 1, "deny");
  } else {
    push("policy", 3, "norm");
    const credDur = credKind === "oauth" ? 20 : credKind === "service" ? 3 : 0;

    if (trace.outcome === "linking_required") {
      push("credential", credDur || 16, "fail");
      push("respond", 1, "fail");
    } else {
      if (credDur > 0) {
        push("credential", credDur, "norm");
      }
      const backendDur =
        trace.durationMs ?? (trace.outcome === "error" ? 30 : 100);
      const backendKind: SpanKind =
        trace.outcome === "error" ? "error" : "good";
      push("backend", backendDur, backendKind);
      push("respond", 1, backendKind);
    }
  }

  const totalMs = rawSpans.reduce((sum, span) => sum + span.dur, 0);

  let offset = 0;
  const spans = rawSpans.map((span) => {
    const view = {
      label: span.label,
      labelClass: spanLabelClass(span.kind),
      barClass: spanBarClass(span.kind),
      leftPct: `${((offset / totalMs) * 100).toFixed(2)}%`,
      widthPct: `${Math.max((span.dur / totalMs) * 100, 1.5).toFixed(2)}%`,
      durLabel: formatSpanDuration(span.dur),
    };
    offset += span.dur;
    return view;
  });

  return { spans, totalMs };
}
