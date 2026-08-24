/** Groups referenced by agents that aren't part of Torii's known set. */
export function collectUnknownGroups(
  groups: readonly string[],
  knownGroupNames: readonly string[],
): string[] {
  const known = new Set(knownGroupNames);
  return groups.filter((group) => !known.has(group));
}

export function isKnownGroup(
  group: string,
  knownGroupNames: readonly string[],
): boolean {
  return knownGroupNames.includes(group);
}
