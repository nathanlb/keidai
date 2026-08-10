import type { OperatorEntry } from "@keidai/shared";
import {
  isOperatorInRegistry,
  resolveOwnerIdFromOperators,
  type OperatorClaims,
} from "@keidai/shared";

/** @deprecated Prefer isOperatorInRegistry / resolveOwnerIdFromOperators. */
export function isOperatorAllowed(
  operators: readonly OperatorEntry[],
  claims: OperatorClaims,
): boolean {
  return isOperatorInRegistry(operators, claims);
}

export function resolveOperatorOwnerId(
  operators: readonly OperatorEntry[],
  claims: OperatorClaims,
): string | null {
  return resolveOwnerIdFromOperators(operators, claims);
}
