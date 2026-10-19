import type { OperatorEntry } from "@keidai/shared";
import { ownerIdsFromOperators } from "@keidai/shared";
import type { AgentRepository } from "../agents/types/agent-repository.js";
import type { OwnerRepository } from "./types/owner-repository.js";
import {
  reconcileOwners,
  resolveOperatorsReconcileMode,
  type OperatorsReconcileMode,
  type ReconcileOwnersResult,
} from "./reconcile-owners.js";
import { loadOperatorsFile } from "./utils/load-operators-file.js";

export interface ApplyOperatorsFileResult extends ReconcileOwnersResult {
  mode: OperatorsReconcileMode;
}

/**
 * Boot sync from operators.yaml (FUDA_OPERATORS_PATH).
 * Returns null when the path is unset.
 *
 * Default mode is additive: listed owners are upserted and JIT owners stay.
 * FUDA_OPERATORS_RECONCILE=strict deletes owners absent from the file.
 */
export async function applyOperatorsFile(
  owners: OwnerRepository,
  agents: AgentRepository,
  operatorsPath: string | undefined = process.env.FUDA_OPERATORS_PATH,
  mode: OperatorsReconcileMode = resolveOperatorsReconcileMode(
    process.env.FUDA_OPERATORS_RECONCILE,
  ),
): Promise<ApplyOperatorsFileResult | null> {
  const trimmed = operatorsPath?.trim();
  if (!trimmed) {
    return null;
  }

  const file = await loadOperatorsFile(trimmed);
  if (mode === "strict") {
    const seeded = await seedOperators(owners, file.operators);
    const reconciled = await reconcileOwners(
      owners,
      agents,
      ownerIdsFromOperators(file.operators),
    );
    return {
      mode,
      ownersUpserted: seeded.ownersUpserted,
      ownersDeleted: reconciled.ownersDeleted,
      agentsDeleted: reconciled.agentsDeleted,
    };
  }

  return {
    mode,
    ...(await seedOperators(owners, file.operators)),
    ownersDeleted: 0,
    agentsDeleted: 0,
  };
}

async function seedOperators(
  owners: OwnerRepository,
  operators: readonly OperatorEntry[],
): Promise<Pick<ReconcileOwnersResult, "ownersUpserted">> {
  let ownersUpserted = 0;
  for (const entry of operators) {
    const before = await owners.get(entry.owner_id);
    let role = entry.role;
    if (!role && !before && (await owners.countActiveAdmins()) === 0) {
      role = "admin";
    }
    await owners.upsert(entry.owner_id, role ? { role } : undefined);
    if (!before) {
      ownersUpserted += 1;
    }
    if (entry.google_email) {
      await owners.setEmailIfAbsent(entry.owner_id, entry.google_email);
    }
  }
  return { ownersUpserted };
}
