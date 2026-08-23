import { randomUUID } from "node:crypto";
import type { GroupDefinitionConfig, ToriiConfig } from "@keidai/shared";
import { parseNamespacedTool } from "../../catalog/utils/namespacing.js";
import type { GroupPolicy, GroupServerPolicy } from "../types/group-policy.js";

export const AGENTS_GROUP_NAME = "agents";

function yamlGroupToPolicy(
  group: GroupDefinitionConfig,
  now: Date,
): GroupPolicy {
  return {
    id: randomUUID(),
    name: group.name,
    description: group.description,
    createdAt: now,
    updatedAt: now,
    servers: group.permissions.map(
      (permission): GroupServerPolicy => ({
        server: permission.server,
        default: "deny",
        allow: [...permission.tools],
        deny: [],
        gated: [],
      }),
    ),
  };
}

function ensureAgentsGroup(
  groups: Map<string, GroupPolicy>,
  now: Date,
): GroupPolicy {
  const existing = groups.get(AGENTS_GROUP_NAME);
  if (existing) {
    return existing;
  }
  const created: GroupPolicy = {
    id: randomUUID(),
    name: AGENTS_GROUP_NAME,
    description: "",
    createdAt: now,
    updatedAt: now,
    servers: [],
  };
  groups.set(AGENTS_GROUP_NAME, created);
  return created;
}

function attachGatedTool(
  agents: GroupPolicy,
  server: string,
  tool: string,
): void {
  let policy = agents.servers.find((entry) => entry.server === server);
  if (!policy) {
    policy = {
      server,
      default: "deny",
      allow: [],
      deny: [],
      gated: [],
    };
    agents.servers.push(policy);
  }
  if (!policy.gated.includes(tool)) {
    policy.gated.push(tool);
  }
}

/**
 * Maps current YAML `groups` / `gated_tools` onto persisted group policy.
 * Allow-lists become `default: deny` + `allow`; YAML `gated_tools` namespaced
 * names are attached as bare tools on the `agents` group's matching server.
 */
export function yamlConfigToGroupPolicies(config: ToriiConfig): GroupPolicy[] {
  const now = new Date();
  const groups = new Map<string, GroupPolicy>();

  for (const group of config.groups ?? []) {
    groups.set(group.name, yamlGroupToPolicy(group, now));
  }

  for (const namespacedTools of Object.values(config.gated_tools ?? {})) {
    for (const namespaced of namespacedTools) {
      const parsed = parseNamespacedTool(namespaced);
      if (!parsed) {
        continue;
      }
      attachGatedTool(
        ensureAgentsGroup(groups, now),
        parsed.server,
        parsed.bareName,
      );
    }
  }

  return [...groups.values()];
}
