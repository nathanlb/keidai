import { randomUUID } from "node:crypto";
import type { GroupDefinitionConfig } from "@keidai/shared";
import { parseNamespacedTool } from "../../catalog/utils/namespacing.js";
import type { GroupPolicy, GroupServerPolicy } from "../types/group-policy.js";

export const AGENTS_GROUP_NAME = "agents";

function groupDefinitionToPolicy(
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

export interface BuildGroupPoliciesInput {
  groups?: GroupDefinitionConfig[];
  /** Namespaced tool names keyed by agent id — merged onto the agents group. */
  gatedTools?: Record<string, string[]>;
}

/** Builds in-memory group policy snapshots for tests and demo seeding. */
export function buildGroupPolicies(input: BuildGroupPoliciesInput = {}): GroupPolicy[] {
  const now = new Date();
  const groups = new Map<string, GroupPolicy>();

  for (const group of input.groups ?? []) {
    groups.set(group.name, groupDefinitionToPolicy(group, now));
  }

  for (const namespacedTools of Object.values(input.gatedTools ?? {})) {
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

/** Compose/kind demo policy — agents group plus gmail draft gating. */
export function createDemoGroupPolicies(): GroupPolicy[] {
  return buildGroupPolicies({
    groups: [
      {
        name: AGENTS_GROUP_NAME,
        description: "Demo agent access for the open-torii digest scenario",
        permissions: [
          {
            server: "linear",
            tools: ["list_issues", "get_issue", "list_projects", "list_initiatives"],
          },
          {
            server: "github",
            tools: ["search_issues", "get_file_contents"],
          },
          {
            server: "notion",
            tools: ["notion-search", "notion-fetch"],
          },
          {
            server: "gmail",
            tools: ["create_draft", "list_drafts"],
          },
        ],
      },
    ],
    gatedTools: {
      "shaiden-newsletter-01": ["gmail.create_draft"],
    },
  });
}
