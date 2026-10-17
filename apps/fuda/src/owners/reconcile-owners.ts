import {
  resolveOperatorsReconcileMode,
  type OperatorsReconcileMode,
} from "@keidai/shared";
import type { AgentRepository } from "../agents/types/agent-repository.js";
import { deleteOwner } from "./delete-owner.js";
import type { OwnerRepository } from "./types/owner-repository.js";

export { resolveOperatorsReconcileMode, type OperatorsReconcileMode };

export interface ReconcileOwnersResult {
  ownersUpserted: number;
  ownersDeleted: number;
  agentsDeleted: number;
}

/**
 * Strict reconcile: owners table matches desiredOwnerIds exactly.
 * Deletes absent owners and cascades their agents.
 */
export async function reconcileOwners(
  owners: OwnerRepository,
  agents: AgentRepository,
  desiredOwnerIds: readonly string[],
): Promise<ReconcileOwnersResult> {
  const desired = new Set(desiredOwnerIds);
  let ownersUpserted = 0;
  let ownersDeleted = 0;
  let agentsDeleted = 0;

  for (const ownerId of desired) {
    const before = await owners.get(ownerId);
    await owners.upsert(ownerId);
    if (!before) {
      ownersUpserted += 1;
    }
  }

  for (const existing of await owners.list()) {
    if (desired.has(existing.ownerId)) {
      continue;
    }
    const deleted = await deleteOwner(owners, agents, existing.ownerId);
    if (!deleted) {
      continue;
    }
    ownersDeleted += 1;
    agentsDeleted += deleted.agentsDeleted;
  }

  return { ownersUpserted, ownersDeleted, agentsDeleted };
}
