import type { IncomingHttpHeaders } from "node:http";
import type { OperatorRole } from "./operator-principal.js";

/** Trusted BFF header carrying the authenticated operator's owner id. */
export const OPERATOR_OWNER_HEADER = "x-keidai-operator-owner";

/** Trusted BFF header carrying the authenticated operator's role. */
export const OPERATOR_ROLE_HEADER = "x-keidai-operator-role";

const OPERATOR_CONTEXT_HEADER_PREFIX = "x-keidai-operator-";

export interface OperatorContext {
  ownerId: string;
  role: OperatorRole;
}

type HeaderMap =
  | IncomingHttpHeaders
  | Record<string, string | string[] | undefined>;

function headerValue(value: string | string[] | undefined): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  if (Array.isArray(value)) {
    return headerValue(value[0]);
  }
  return undefined;
}

function isOperatorRole(value: string | undefined): value is OperatorRole {
  return value === "admin" || value === "member";
}

/**
 * Reads the operator context the BFF injects on upstream calls.
 * Returns null when either header is missing or the role is not a known value,
 * so unauthenticated and internal callers keep the previous behavior.
 */
export function readOperatorContext(
  headers: HeaderMap,
): OperatorContext | null {
  const ownerId = headerValue(headers[OPERATOR_OWNER_HEADER]);
  const role = headerValue(headers[OPERATOR_ROLE_HEADER]);
  if (!ownerId || !isOperatorRole(role)) {
    return null;
  }
  return { ownerId, role };
}

/** Drops client-supplied operator headers so only the BFF can set them. */
export function stripOperatorContextHeaders<T extends HeaderMap>(
  headers: T,
): T {
  const next = { ...headers };
  for (const key of Object.keys(next)) {
    if (key.toLowerCase().startsWith(OPERATOR_CONTEXT_HEADER_PREFIX)) {
      delete next[key];
    }
  }
  return next;
}

/** Headers the BFF injects after stripping any client-supplied operator headers. */
export function operatorContextHeaders(
  operator: OperatorContext,
): Record<string, string> {
  return {
    [OPERATOR_OWNER_HEADER]: operator.ownerId,
    [OPERATOR_ROLE_HEADER]: operator.role,
  };
}
