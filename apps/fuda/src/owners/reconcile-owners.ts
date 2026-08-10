import type { AgentRepository } from "../agents/types/agent-repository.js";
import type { OwnerRepository } from "./types/owner-repository.js";

export interface ReconcileOwnersResult {
  ownersUpserted: number;
  ownersDeleted: number;
  agentsDeleted: number;
}

/**
 * Strict reconcile: owners table matches desiredOwnerIds exactly.
 * Deletes absent owners and cascades their agents (personas/grants via
 * AgentRepository.delete).
 */
export function reconcileOwners(
  owners: OwnerRepository,
  agents: AgentRepository,
  desiredOwnerIds: readonly string[],
): ReconcileOwnersResult {
  const desired = new Set(desiredOwnerIds);
  let ownersUpserted = 0;
  let ownersDeleted = 0;
  let agentsDeleted = 0;

  for (const ownerId of desired) {
    const before = owners.get(ownerId);
    owners.upsert(ownerId);
    if (!before) {
      ownersUpserted += 1;
    }
  }

  for (const existing of owners.list()) {
    if (desired.has(existing.ownerId)) {
      continue;
    }

    for (const agent of agents.list()) {
      if (agent.ownerId !== existing.ownerId) {
        continue;
      }
      if (agents.delete(agent.id)) {
        agentsDeleted += 1;
      }
    }

    if (owners.delete(existing.ownerId)) {
      ownersDeleted += 1;
    }
  }

  return { ownersUpserted, ownersDeleted, agentsDeleted };
}
