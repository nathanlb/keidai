import type { GroupPolicyRepository } from "../types/group-policy-repository.js";
import { createDemoGroupPolicies } from "./build-group-policies.js";

export interface SeedDemoGroupPoliciesResult {
  seeded: boolean;
  groupCount: number;
}

/** Seeds the compose/kind demo policy when the groups table is empty. */
export async function seedDemoGroupPoliciesIfEmpty(
  repository: GroupPolicyRepository,
): Promise<SeedDemoGroupPoliciesResult> {
  if (!(await repository.isEmpty())) {
    return { seeded: false, groupCount: 0 };
  }

  const groups = createDemoGroupPolicies();
  await repository.insertAll(groups);
  return { seeded: true, groupCount: groups.length };
}
