import type { GroupPolicy } from "./group-policy.js";

export interface GroupPolicyRepository {
  list(): Promise<GroupPolicy[]>;
  isEmpty(): Promise<boolean>;
  insertAll(groups: readonly GroupPolicy[]): Promise<void>;
}

/** tsyringe injection token for {@link GroupPolicyRepository}. */
export const GROUP_POLICY_REPOSITORY = Symbol("GroupPolicyRepository");
