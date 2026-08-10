import { ownerIdsFromOperators } from "@keidai/shared";
import type { AgentRepository } from "../agents/types/agent-repository.js";
import type { OwnerRepository } from "./types/owner-repository.js";
import {
  reconcileOwners,
  type ReconcileOwnersResult,
} from "./reconcile-owners.js";
import { loadOperatorsFile } from "./utils/load-operators-file.js";

/**
 * Strict owners sync from operators.yaml (FUDA_OPERATORS_PATH).
 * Returns null when the env var is unset (no-op).
 */
export async function applyOperatorsFile(
  owners: OwnerRepository,
  agents: AgentRepository,
  operatorsPath: string | undefined = process.env.FUDA_OPERATORS_PATH,
): Promise<ReconcileOwnersResult | null> {
  const trimmed = operatorsPath?.trim();
  if (!trimmed) {
    return null;
  }

  const file = await loadOperatorsFile(trimmed);
  return reconcileOwners(
    owners,
    agents,
    ownerIdsFromOperators(file.operators),
  );
}
