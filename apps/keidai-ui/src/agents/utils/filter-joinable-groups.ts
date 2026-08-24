import type { GroupView } from "@keidai/shared";

/** Defined groups the agent is not already in, filtered by name or description. */
export function filterJoinableGroups(
  groups: readonly GroupView[],
  membership: readonly string[],
  query: string,
): GroupView[] {
  const joined = new Set(membership);
  const needle = query.trim().toLowerCase();
  return groups.filter((group) => {
    if (joined.has(group.name)) {
      return false;
    }
    if (!needle) {
      return true;
    }
    return (
      group.name.toLowerCase().includes(needle) ||
      group.description.toLowerCase().includes(needle)
    );
  });
}
