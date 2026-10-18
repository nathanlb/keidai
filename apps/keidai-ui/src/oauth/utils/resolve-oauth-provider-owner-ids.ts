/**
 * Owner IDs whose OAuth grants should appear on the providers page.
 *
 * Scopes strictly to the signed-in operator's personal grants so cards never
 * display or fan out across other operators' agent owners.
 */
export function resolveOAuthProviderOwnerIds(
  actingOwnerId: string | undefined,
  _agentOwnerIds?: readonly string[],
): string[] {
  return actingOwnerId ? [actingOwnerId] : [];
}
