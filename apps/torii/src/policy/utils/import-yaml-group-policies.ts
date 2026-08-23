import type { ToriiConfig } from "@keidai/shared";
import type { GroupPolicyRepository } from "../types/group-policy-repository.js";
import { yamlConfigToGroupPolicies } from "./yaml-config-to-group-policies.js";

export interface ImportYamlGroupPoliciesResult {
  imported: boolean;
  groupCount: number;
}

/** One-shot YAML → DB seed when the groups table is empty. */
export async function importYamlGroupPoliciesIfEmpty(
  repository: GroupPolicyRepository,
  config: ToriiConfig,
): Promise<ImportYamlGroupPoliciesResult> {
  if (!(await repository.isEmpty())) {
    return { imported: false, groupCount: 0 };
  }

  const groups = yamlConfigToGroupPolicies(config);
  if (groups.length === 0) {
    return { imported: false, groupCount: 0 };
  }

  await repository.insertAll(groups);
  return { imported: true, groupCount: groups.length };
}
