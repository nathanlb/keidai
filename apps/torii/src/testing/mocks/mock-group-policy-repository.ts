import type { GroupPolicy } from "../../policy/types/group-policy.js";
import type { GroupPolicyRepository } from "../../policy/types/group-policy-repository.js";

/** @internal Test-only. Not for production use. */
export class MockGroupPolicyRepository implements GroupPolicyRepository {
  private readonly groups: GroupPolicy[] = [];

  async list(): Promise<GroupPolicy[]> {
    return [...this.groups];
  }

  async isEmpty(): Promise<boolean> {
    return this.groups.length === 0;
  }

  async insertAll(groups: readonly GroupPolicy[]): Promise<void> {
    this.groups.push(...groups);
  }
}
