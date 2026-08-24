/**
 * Owner IDs whose OAuth grants should appear on the providers page.
 *
 * Always includes the acting operator (links are stored under that owner even
 * when they have no agents yet). Agent owners are unioned so multi-owner
 * fleets stay visible.
 */
export function resolveOAuthProviderOwnerIds(
  actingOwnerId: string | undefined,
  agentOwnerIds: readonly string[],
): string[] {
  return [
    ...new Set([
      ...(actingOwnerId ? [actingOwnerId] : []),
      ...agentOwnerIds,
    ]),
  ];
}
