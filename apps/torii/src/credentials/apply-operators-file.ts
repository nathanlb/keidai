import { ownerIdsFromOperators } from "@keidai/shared";
import {
  reconcileOAuthGrants,
  type ReconcileOAuthGrantsResult,
} from "./reconcile-oauth-grants.js";
import type { PendingOAuthLinkStore } from "./types/pending-oauth-link-store.js";
import type { TokenRepository } from "./types/token-repository.js";
import { loadOperatorsFile } from "./utils/load-operators-file.js";

/**
 * Best-effort OAuth grant wipe from operators.yaml (TORII_OPERATORS_PATH).
 * Returns null when the env var is unset (no-op — never wipe without a registry).
 */
export async function applyOperatorsFile(
  tokens: TokenRepository,
  pendingLinks: PendingOAuthLinkStore,
  operatorsPath: string | undefined = process.env.TORII_OPERATORS_PATH,
): Promise<ReconcileOAuthGrantsResult | null> {
  const trimmed = operatorsPath?.trim();
  if (!trimmed) {
    return null;
  }

  const file = await loadOperatorsFile(trimmed);
  return reconcileOAuthGrants(
    tokens,
    pendingLinks,
    ownerIdsFromOperators(file.operators),
  );
}
