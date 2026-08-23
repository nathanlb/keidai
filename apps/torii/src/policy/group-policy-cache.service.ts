import type { GroupPolicy } from "./types/group-policy.js";

/** In-memory snapshot of group policy. Loaded once at boot in this story. */
export class GroupPolicyCache {
  constructor(private groups: readonly GroupPolicy[] = []) {}

  static fromGroups(groups: readonly GroupPolicy[]): GroupPolicyCache {
    return new GroupPolicyCache(groups);
  }

  get(): readonly GroupPolicy[] {
    return this.groups;
  }

  replace(groups: readonly GroupPolicy[]): void {
    this.groups = groups;
  }
}
