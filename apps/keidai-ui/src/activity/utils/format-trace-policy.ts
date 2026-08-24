import type { TraceListItem } from "@keidai/shared/dto";

export function formatTracePolicyShort(trace: TraceListItem): string {
  if (trace.policyDecision === "denied") {
    return "deny";
  }
  return "allow";
}

export function policyTextClass(trace: TraceListItem): string {
  return trace.policyDecision === "denied"
    ? "text-destructive"
    : "text-muted-foreground";
}
