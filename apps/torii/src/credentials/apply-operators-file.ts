import {
  ownerIdsFromOperators,
  resolveOperatorsReconcileMode,
  type OperatorsReconcileMode,
} from "@keidai/shared";
import {
  reconcileOAuthGrants,
  type ReconcileOAuthGrantsResult,
} from "./reconcile-oauth-grants.js";
import type { PendingOAuthLinkStore } from "./types/pending-oauth-link-store.js";
import type { TokenRepository } from "./types/token-repository.js";
import { loadOperatorsFile } from "./utils/load-operators-file.js";

export interface ApplyOperatorsFileResult extends ReconcileOAuthGrantsResult {
  mode: OperatorsReconcileMode;
}

/**
 * OAuth grant sync from operators.yaml (TORII_OPERATORS_PATH).
 * Returns null when the path is unset.
 *
 * Default mode is additive: the file is validated and grants are left in
 * place, including grants for JIT owners who are not listed.
 * TORII_OPERATORS_RECONCILE=strict wipes grants for absent owner ids.
 */
export async function applyOperatorsFile(
  tokens: TokenRepository,
  pendingLinks: PendingOAuthLinkStore,
  operatorsPath: string | undefined = process.env.TORII_OPERATORS_PATH,
  mode: OperatorsReconcileMode = resolveOperatorsReconcileMode(
    process.env.TORII_OPERATORS_RECONCILE,
  ),
): Promise<ApplyOperatorsFileResult | null> {
  const trimmed = operatorsPath?.trim();
  if (!trimmed) {
    return null;
  }

  const file = await loadOperatorsFile(trimmed);
  if (mode !== "strict") {
    return {
      mode: "additive",
      tokensDeleted: 0,
      pendingLinksDeleted: 0,
      ownersWiped: 0,
      wipedOwnerIds: [],
    };
  }

  const reconciled = await reconcileOAuthGrants(
    tokens,
    pendingLinks,
    ownerIdsFromOperators(file.operators),
  );
  return { mode: "strict", ...reconciled };
}
