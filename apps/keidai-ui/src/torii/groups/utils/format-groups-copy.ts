import type { ConnectionState } from "@keidai/shared";
import type { UndefinedGroupRef } from "./collect-undefined-groups.js";

function plural(count: number, singular: string, pluralForm: string): string {
  return count === 1 ? singular : pluralForm;
}

function countPhrase(count: number, singular: string, pluralForm: string): string {
  return `${count} ${plural(count, singular, pluralForm)}`;
}

export function formatUndefinedGroupsTitle(
  refs: readonly UndefinedGroupRef[],
): string {
  return `${refs.length} ${plural(refs.length, "group is", "groups are")} referenced but not defined`;
}

/** Design copy uses words for small counts. */
export function formatUndefinedGroupsCopy(
  refs: readonly UndefinedGroupRef[],
): {
  title: string;
  body: string;
  defineName: string | undefined;
} {
  const primary = refs[0];
  if (!primary) {
    return { title: "", body: "", defineName: undefined };
  }

  const agentWords: Record<number, string> = {
    1: "One agent belongs",
    2: "Two agents belong",
  };
  const agentLead =
    agentWords[primary.agentCount] ??
    `${primary.agentCount} agents belong`;

  let body = `${agentLead} to ${primary.name}, which grants nothing because no policy defines it. Their calls are denied at the gateway. Define it or remove it from those agents.`;
  if (refs.length > 1) {
    const others = refs
      .slice(1)
      .map((ref) => ref.name)
      .join(", ");
    body += ` Also undefined: ${others}.`;
  }

  return {
    title: formatUndefinedGroupsTitle(refs),
    body,
    defineName: primary.name,
  };
}

export function formatListFooter(
  definedCount: number,
  undefinedCount: number,
): string {
  const defined = countPhrase(definedCount, "group defined", "groups defined");
  if (undefinedCount === 0) {
    return defined;
  }
  return `${defined} · ${undefinedCount} referenced but undefined`;
}

export function formatGrantsLabel(
  allowed: number,
  total: number | null,
): string {
  if (total === null) {
    return countPhrase(allowed, "tool allowed", "tools allowed");
  }
  return `${allowed} of ${total} tools`;
}

export function formatGatedLabel(gated: number): string | null {
  if (gated === 0) {
    return null;
  }
  return `${gated} need approval`;
}

export function formatAgentCountLabel(count: number): string {
  return countPhrase(count, "agent", "agents");
}

export function formatOtherGroupsLine(otherNames: readonly string[]): string {
  if (otherNames.length === 0) {
    return "only group";
  }
  if (otherNames.length === 1) {
    return `also in ${otherNames[0]}`;
  }
  return `also in ${otherNames.join(", ")}`;
}

export function formatDefaultExplain(
  policyDefault: "allow" | "deny",
): string {
  if (policyDefault === "allow") {
    return "Permitted — including any tool this server adds in future. Broad by design; switch to Deny to allow only the rules above.";
  }
  return "Denied, including any tool this server adds in future. This is the fail-closed setting.";
}

export function formatUnruledCount(count: number | null): string | null {
  if (count === null) {
    return null;
  }
  return `${count} left`;
}

export function formatEverythingElseCount(count: number | null): string | null {
  if (count === null) {
    return null;
  }
  return count === 1 ? "1 tool" : `${count} tools`;
}

export function formatServerSummary(
  reachable: number,
  total: number | null,
  gated: number,
): string {
  const reach =
    total === null
      ? countPhrase(reachable, "tool reachable", "tools reachable")
      : `${reachable} of ${total} tools reachable`;
  if (gated === 0) {
    return reach;
  }
  return `${reach} · ${gated} ${gated === 1 ? "needs" : "need"} approval`;
}

export function formatCatalogueUnavailable(
  state: ConnectionState | undefined,
): string {
  if (state === "connecting") {
    return "Still connecting — tool rules can be edited, but the catalogue isn't loaded yet.";
  }
  if (state === "failed") {
    return "Connection failed — reconnect the backend to add rules from its live catalogue.";
  }
  return "No tools reported by this backend. Existing rules stay editable.";
}

export function formatPickerEmpty(
  unruledCount: number,
): string {
  return unruledCount === 0
    ? "Every tool on this server already has a rule."
    : "No tool matches that search.";
}

export function formatDeleteGroupConfirm(
  agentCount: number,
  allowedTools: number,
): string {
  const agents = countPhrase(agentCount, "agent loses", "agents lose");
  const tools = countPhrase(allowedTools, "tool", "tools");
  return `${agents} ${tools}.`;
}
