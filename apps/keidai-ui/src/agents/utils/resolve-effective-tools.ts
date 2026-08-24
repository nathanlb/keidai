import type { GroupView } from "@keidai/shared";
import type { ServerCatalogue } from "../../groups/types/group-editor.js";
import { resolveToolEffect } from "../../groups/utils/resolve-tool-effect.js";

export type EffectiveToolState = "permit" | "gated" | "deny";

export type EffectiveToolsFilter = EffectiveToolState | "all";

export interface EffectiveToolRow {
  server: string;
  name: string;
  description: string;
  state: EffectiveToolState;
  reason: string;
  defaultAllow: boolean;
  conflict: boolean;
  grantedBy: string[];
  deniedBy: string[];
  gatedBy: string[];
}

export interface EffectiveServerSection {
  name: string;
  via: string[];
  catalogueAvailable: boolean;
  unavailableReason?: string;
  tools: EffectiveToolRow[];
}

export interface EffectiveToolsConflict {
  server: string;
  tool: string;
  grantedBy: string;
  deniedBy: string;
}

export interface EffectiveToolsResult {
  servers: EffectiveServerSection[];
  permittedCount: number;
  gatedCount: number;
  deniedCount: number;
  definedGroupCount: number;
  conflicts: EffectiveToolsConflict[];
}

const STATE_ORDER: Record<EffectiveToolState, number> = {
  gated: 0,
  permit: 1,
  deny: 2,
};

interface ToolVotes {
  description: string;
  allow: string[];
  deny: string[];
  gated: string[];
  defaultAllow: string[];
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function joinNames(names: readonly string[]): string {
  return names.join(", ");
}

function resolveRow(
  server: string,
  tool: string,
  votes: ToolVotes,
): EffectiveToolRow {
  const grantedBy = uniqueSorted([...votes.allow, ...votes.gated]);
  const deniedBy = uniqueSorted(votes.deny);
  const gatedBy = uniqueSorted(votes.gated);
  const defaultAllowOnly =
    votes.allow.length > 0 &&
    votes.allow.every((group) => votes.defaultAllow.includes(group)) &&
    votes.gated.length === 0;

  let state: EffectiveToolState = "deny";
  let reason = "no group grants it";
  let conflict = false;

  if (deniedBy.length > 0 && grantedBy.length > 0) {
    state = "deny";
    conflict = true;
    reason = `${grantedBy[0]} grants it · ${deniedBy[0]} denies it`;
  } else if (deniedBy.length > 0) {
    state = "deny";
    reason = `denied by ${joinNames(deniedBy)}`;
  } else if (gatedBy.length > 0) {
    state = "gated";
    reason = `via ${joinNames(gatedBy)}`;
  } else if (votes.allow.length > 0) {
    state = "permit";
    reason = defaultAllowOnly
      ? `via ${votes.defaultAllow[0]}'s default allow`
      : `via ${joinNames(uniqueSorted(votes.allow.filter((group) => !votes.defaultAllow.includes(group))))}`;
  }

  return {
    server,
    name: tool,
    description: votes.description,
    state,
    reason,
    defaultAllow: defaultAllowOnly,
    conflict,
    grantedBy,
    deniedBy,
    gatedBy,
  };
}

/**
 * Union of every *defined* group the agent is in.
 * Explicit deny wins; gated still permits with a gate; default-allow is flagged.
 * Unknown group names contribute nothing.
 */
export function resolveEffectiveTools(
  membership: readonly string[],
  groups: readonly GroupView[],
  catalogues: Readonly<Record<string, ServerCatalogue>>,
): EffectiveToolsResult {
  const defined = new Map(groups.map((group) => [group.name, group]));
  const membershipGroups = membership
    .map((name) => defined.get(name))
    .filter((group): group is GroupView => group !== undefined);

  const viaByServer = new Map<string, string[]>();
  const votesByServer = new Map<string, Map<string, ToolVotes>>();

  for (const group of membershipGroups) {
    for (const policy of group.servers) {
      const via = viaByServer.get(policy.server) ?? [];
      via.push(group.name);
      viaByServer.set(policy.server, via);

      const catalogue = catalogues[policy.server];
      const namedTools = new Set<string>([
        ...(catalogue?.tools.map((tool) => tool.name) ?? []),
        ...policy.allow,
        ...policy.deny,
        ...policy.gated,
      ]);

      const serverVotes =
        votesByServer.get(policy.server) ?? new Map<string, ToolVotes>();
      votesByServer.set(policy.server, serverVotes);

      for (const tool of namedTools) {
        const description =
          catalogue?.tools.find((entry) => entry.name === tool)?.description ??
          "";
        const votes = serverVotes.get(tool) ?? {
          description,
          allow: [],
          deny: [],
          gated: [],
          defaultAllow: [],
        };
        if (!votes.description && description) {
          votes.description = description;
        }

        const effect = resolveToolEffect(policy, tool);
        if (effect === "gated") {
          votes.gated.push(group.name);
        } else if (effect === "denied") {
          votes.deny.push(group.name);
        } else if (effect === "allowed") {
          votes.allow.push(group.name);
        } else if (policy.default === "allow") {
          votes.allow.push(group.name);
          votes.defaultAllow.push(group.name);
        }
        serverVotes.set(tool, votes);
      }
    }
  }

  const servers: EffectiveServerSection[] = [...viaByServer.keys()]
    .sort((left, right) => left.localeCompare(right))
    .map((server) => {
      const catalogue = catalogues[server];
      const rows = [...(votesByServer.get(server)?.entries() ?? [])].map(
        ([tool, votes]) => resolveRow(server, tool, votes),
      );
      rows.sort(
        (left, right) =>
          STATE_ORDER[left.state] - STATE_ORDER[right.state] ||
          left.name.localeCompare(right.name),
      );
      return {
        name: server,
        via: uniqueSorted(viaByServer.get(server) ?? []),
        catalogueAvailable: catalogue?.available !== false && Boolean(catalogue),
        unavailableReason: catalogue?.unavailableReason,
        tools: rows,
      };
    });

  let permittedCount = 0;
  let gatedCount = 0;
  let deniedCount = 0;
  const conflicts: EffectiveToolsConflict[] = [];
  for (const server of servers) {
    for (const tool of server.tools) {
      if (tool.state === "permit") {
        permittedCount += 1;
      } else if (tool.state === "gated") {
        gatedCount += 1;
      } else {
        deniedCount += 1;
      }
      if (tool.conflict && tool.grantedBy[0] && tool.deniedBy[0]) {
        conflicts.push({
          server: server.name,
          tool: tool.name,
          grantedBy: tool.grantedBy[0],
          deniedBy: tool.deniedBy[0],
        });
      }
    }
  }

  return {
    servers,
    permittedCount,
    gatedCount,
    deniedCount,
    definedGroupCount: membershipGroups.length,
    conflicts,
  };
}

export function filterEffectiveTools(
  result: EffectiveToolsResult,
  filter: EffectiveToolsFilter,
): EffectiveServerSection[] {
  if (filter === "all") {
    return result.servers;
  }
  return result.servers.map((server) => ({
    ...server,
    tools: server.tools.filter((tool) => tool.state === filter),
  }));
}
