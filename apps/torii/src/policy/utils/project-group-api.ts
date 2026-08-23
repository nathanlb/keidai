import type { GroupView } from "@keidai/shared";
import { toIso } from "@keidai/postgres";
import type { GroupPolicy } from "../types/group-policy.js";

export function toGroupView(group: GroupPolicy): GroupView {
  return {
    id: group.id,
    name: group.name,
    description: group.description,
    createdAt: toIso(group.createdAt),
    updatedAt: toIso(group.updatedAt),
    servers: group.servers.map((policy) => ({
      server: policy.server,
      default: policy.default,
      allow: [...policy.allow],
      deny: [...policy.deny],
      gated: [...policy.gated],
    })),
  };
}
