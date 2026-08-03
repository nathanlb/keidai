import type { PublicServerConfig } from "@keidai/shared/dto";
import type { TraceListItem } from "@keidai/shared";

export interface TracePolicyDetail {
  headline: string;
  reason: string;
  variant: "denied" | "allowed";
  policyDefault: string;
  matchedRule: string | null;
}

function formatUnknownGroupReason(error: string | undefined): string | null {
  if (!error?.startsWith("unknown_group:")) {
    return null;
  }
  const groups = error.slice("unknown_group:".length).trim();
  if (!groups) {
    return "The calling principal includes a group Torii does not define, so the call was denied (fail closed).";
  }
  const label = groups.includes(",") ? "groups" : "group";
  return `The calling principal includes unknown ${label} "${groups}". Torii fails closed on undefined groups, so the call was blocked before any credential or backend resolution.`;
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
    const unknownGroupReason = formatUnknownGroupReason(trace.error);
    return {
      headline: "Denied by policy",
      reason:
        unknownGroupReason ??
        `"${trace.tool}" is not granted to the calling principal's groups for server "${trace.server}". The call was blocked before any credential or backend resolution.`,
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
      ? "Matched a group grant for this server and tool. The call proceeded to credential resolution and the backend."
      : "Policy permitted the call. The call proceeded to credential resolution and the backend.",
    variant: "allowed",
    policyDefault,
    matchedRule,
  };
}
