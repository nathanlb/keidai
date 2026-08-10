/**
 * Resolves the owner id for OAuth link/read flows.
 * Explicit `?owner=` is required — there is no deployment-wide boot fallback.
 */
export function resolveOAuthOwnerId(ownerIdFlag: string | undefined): string {
  if (ownerIdFlag) {
    return ownerIdFlag;
  }

  throw new Error("owner query parameter is required");
}
