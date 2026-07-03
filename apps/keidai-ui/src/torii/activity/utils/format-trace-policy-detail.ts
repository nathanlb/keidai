import type { PublicServerConfig } from "@keidai/shared/dto";
import type { TraceListItem } from "@keidai/shared";

export interface TracePolicyDetail {
  headline: string;
  reason: string;
  variant: "denied" | "allowed";
  policyDefault: string;
  matchedRule: string | null;
}

export function formatTracePolicyDetail(
  trace: TraceListItem,
  server?: PublicServerConfig,
): TracePolicyDetail {
  const denied = trace.policyDecision === "denied";
  const policyDefault = server?.policy.default ?? "deny";

  const matchedRule =
    !denied && server?.policy.allow?.includes(trace.tool)
      ? `allow ${trace.tool}`
      : !denied && policyDefault === "allow"
        ? "default allow"
        : !denied
          ? `allow ${trace.tool}`
          : null;

  if (denied) {
    return {
      headline: "Denied by policy",
      reason: `"${trace.tool}" is not in the allow-list for server "${trace.server}". The default action is deny, so the call was blocked before any credential or backend resolution.`,
      variant: "denied",
      policyDefault,
      matchedRule: null,
    };
  }

  if (trace.outcome === "linking_required") {
    return {
      headline: "Allowed by policy",
      reason:
        "Policy permitted the call, but it was blocked downstream at credential resolution (see below).",
      variant: "allowed",
      policyDefault,
      matchedRule,
    };
  }

  return {
    headline: "Allowed by policy",
    reason: matchedRule
      ? "Matched an explicit allow rule. The call proceeded to credential resolution and the backend."
      : "Policy permitted the call. The call proceeded to credential resolution and the backend.",
    variant: "allowed",
    policyDefault,
    matchedRule,
  };
}
