import type { PendingOAuthLinkStore } from "./types/pending-oauth-link-store.js";
import type { TokenRepository } from "./types/token-repository.js";

export interface ReconcileOAuthGrantsResult {
  tokensDeleted: number;
  pendingLinksDeleted: number;
  ownersWiped: number;
  wipedOwnerIds: string[];
}

/**
 * Best-effort wipe of OAuth tokens and pending links for owner_ids absent
 * from the operators registry. Desired owners are left untouched.
 */
export async function reconcileOAuthGrants(
  tokens: TokenRepository,
  pendingLinks: PendingOAuthLinkStore,
  desiredOwnerIds: readonly string[],
): Promise<ReconcileOAuthGrantsResult> {
  const desired = new Set(desiredOwnerIds);
  const storedOwnerIds = new Set([
    ...(await tokens.listOwnerIds()),
    ...(await pendingLinks.listOwnerIds()),
  ]);

  let tokensDeleted = 0;
  let pendingLinksDeleted = 0;
  const wipedOwnerIds: string[] = [];

  for (const ownerId of storedOwnerIds) {
    if (desired.has(ownerId)) {
      continue;
    }
    tokensDeleted += await tokens.deleteByOwner(ownerId);
    pendingLinksDeleted += await pendingLinks.deleteByOwner(ownerId);
    wipedOwnerIds.push(ownerId);
  }

  wipedOwnerIds.sort();
  return {
    tokensDeleted,
    pendingLinksDeleted,
    ownersWiped: wipedOwnerIds.length,
    wipedOwnerIds,
  };
}
