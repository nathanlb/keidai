import type { GroupPolicy } from "./group-policy.js";
import type {
  CreateGroupPolicyInput,
  UpdateGroupPolicyInput,
} from "./group-policy-write.js";

export interface GroupPolicyRepository {
  list(): Promise<GroupPolicy[]>;
  get(id: string): Promise<GroupPolicy | null>;
  create(input: CreateGroupPolicyInput): Promise<GroupPolicy>;
  update(
    id: string,
    input: UpdateGroupPolicyInput,
  ): Promise<GroupPolicy | null>;
  delete(id: string): Promise<boolean>;
  referencesServer(server: string): Promise<boolean>;
}

/** tsyringe injection token for {@link GroupPolicyRepository}. */
export const GROUP_POLICY_REPOSITORY = Symbol("GroupPolicyRepository");
