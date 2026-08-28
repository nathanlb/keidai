import type { GroupPolicy } from "../../policy/types/group-policy.js";
import type { GroupPolicyRepository } from "../../policy/types/group-policy-repository.js";
import type {
  CreateGroupPolicyInput,
  UpdateGroupPolicyInput,
} from "../../policy/types/group-policy-write.js";

/** @internal Test-only. Not for production use. */
export class MockGroupPolicyRepository implements GroupPolicyRepository {
  private readonly groups: GroupPolicy[] = [];

  async list(): Promise<GroupPolicy[]> {
    return [...this.groups].sort((left, right) =>
      left.name.localeCompare(right.name),
    );
  }

  async get(id: string): Promise<GroupPolicy | null> {
    return this.groups.find((group) => group.id === id) ?? null;
  }

  async create(input: CreateGroupPolicyInput): Promise<GroupPolicy> {
    if (this.groups.some((group) => group.name === input.name)) {
      const error = new Error(
        `duplicate key value violates unique constraint "groups_name_key"`,
      );
      Object.assign(error, {
        code: "23505",
        constraint: "groups_name_key",
      });
      throw error;
    }
    const now = new Date();
    const group: GroupPolicy = {
      id: `mock-${input.name}`,
      name: input.name,
      description: input.description,
      createdAt: now,
      updatedAt: now,
      servers: input.servers.map((policy) => ({ ...policy })),
    };
    this.groups.push(group);
    return group;
  }

  async update(
    id: string,
    input: UpdateGroupPolicyInput,
  ): Promise<GroupPolicy | null> {
    const group = this.groups.find((entry) => entry.id === id);
    if (!group) {
      return null;
    }
    if (input.description !== undefined) {
      group.description = input.description;
    }
    if (input.servers !== undefined) {
      group.servers = input.servers.map((policy) => ({ ...policy }));
    }
    group.updatedAt = new Date();
    return group;
  }

  async delete(id: string): Promise<boolean> {
    const index = this.groups.findIndex((group) => group.id === id);
    if (index < 0) {
      return false;
    }
    this.groups.splice(index, 1);
    return true;
  }

  async referencesServer(server: string): Promise<boolean> {
    return this.groups.some((group) =>
      group.servers.some((policy) => policy.server === server),
    );
  }
}
