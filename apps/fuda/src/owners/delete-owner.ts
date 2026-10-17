import type { AgentRepository } from "../agents/types/agent-repository.js";
import type { OwnerRepository } from "./types/owner-repository.js";

export interface DeleteOwnerResult {
  agentsDeleted: number;
  oauthGrantsWiped: boolean;
  tokensDeleted: number;
  pendingLinksDeleted: number;
}

export interface OwnerGrantCleaner {
  wipe(
    ownerId: string,
  ): Promise<{ tokensDeleted: number; pendingLinksDeleted: number }>;
}

/** tsyringe injection token. Absent when Fuda has no Torii URL. */
export const OWNER_GRANT_CLEANER = Symbol("OwnerGrantCleaner");

/**
 * Deletes an owner and that owner's agents. When a grant cleaner is
 * configured, OAuth tokens are wiped first so a Torii failure leaves the
 * owner row in place.
 */
export async function deleteOwner(
  owners: OwnerRepository,
  agents: AgentRepository,
  ownerId: string,
  grants?: OwnerGrantCleaner,
): Promise<DeleteOwnerResult | null> {
  if (!(await owners.get(ownerId))) {
    return null;
  }

  let tokensDeleted = 0;
  let pendingLinksDeleted = 0;
  let oauthGrantsWiped = false;
  if (grants) {
    const wiped = await grants.wipe(ownerId);
    tokensDeleted = wiped.tokensDeleted;
    pendingLinksDeleted = wiped.pendingLinksDeleted;
    oauthGrantsWiped = true;
  }

  let agentsDeleted = 0;
  for (const agent of await agents.list()) {
    if (agent.ownerId !== ownerId) {
      continue;
    }
    if (await agents.delete(agent.id)) {
      agentsDeleted += 1;
    }
  }

  if (!(await owners.delete(ownerId))) {
    return null;
  }

  return {
    agentsDeleted,
    oauthGrantsWiped,
    tokensDeleted,
    pendingLinksDeleted,
  };
}
