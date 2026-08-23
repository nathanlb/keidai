/** Effect a group applies to a server/tool when lists do not match. */
export type PolicyEffect = "allow" | "deny";

/**
 * Per-server policy for one group. Field names match PolicyConfig
 * (`default` / `allow` / `deny`); `gated` is the human-approval list.
 * Tool names are bare, not `server.tool`.
 */
export interface GroupServerPolicy {
  server: string;
  default: PolicyEffect;
  allow: string[];
  deny: string[];
  gated: string[];
}

/** Snapshot used by evaluation — name is the Fuda join key. */
export interface GroupPolicySnapshot {
  name: string;
  servers: readonly GroupServerPolicy[];
}

/** Persisted group definition. `name` is unique and immutable. */
export interface GroupPolicy extends GroupPolicySnapshot {
  id: string;
  description: string;
  createdAt: Date;
  updatedAt: Date;
  servers: GroupServerPolicy[];
}
