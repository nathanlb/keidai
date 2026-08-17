import { z } from "zod";

/**
 * Single source of truth for platform operators: opaque owner_id ↔ Google identity.
 * Loaded by the keidai-ui BFF at boot, reconciled into Fuda's owners table,
 * and used by Torii to wipe OAuth grants for removed operators.
 */
export const operatorEntrySchema = z
  .object({
    owner_id: z.string().min(1),
    google_sub: z.string().min(1).optional(),
    google_email: z.string().email().optional(),
  })
  .strict()
  .refine(
    (entry) => Boolean(entry.google_sub?.trim() || entry.google_email?.trim()),
    {
      message: "each operator requires google_sub and/or google_email",
    },
  );

export const operatorsFileSchema = z
  .object({
    operators: z.array(operatorEntrySchema).min(1),
  })
  .strict();

export type OperatorEntry = z.infer<typeof operatorEntrySchema>;
export type OperatorsFile = z.infer<typeof operatorsFileSchema>;

export class OperatorsValidationError extends Error {
  constructor(readonly errors: string[]) {
    super(errors.join("; "));
    this.name = "OperatorsValidationError";
  }
}

function uniquenessErrors(operators: OperatorEntry[]): string[] {
  const errors: string[] = [];
  const ownerIds = new Set<string>();
  const googleSubs = new Set<string>();
  const emails = new Set<string>();

  for (const [index, entry] of operators.entries()) {
    const path = `operators.${index}`;
    if (ownerIds.has(entry.owner_id)) {
      errors.push(`${path}.owner_id: duplicate owner_id "${entry.owner_id}"`);
    }
    ownerIds.add(entry.owner_id);

    const sub = entry.google_sub?.trim();
    if (sub) {
      if (googleSubs.has(sub)) {
        errors.push(`${path}.google_sub: duplicate google_sub "${sub}"`);
      }
      googleSubs.add(sub);
    }

    const email = entry.google_email?.trim().toLowerCase();
    if (email) {
      if (emails.has(email)) {
        errors.push(`${path}.google_email: duplicate google_email "${email}"`);
      }
      emails.add(email);
    }
  }

  return errors;
}

/** Parse and validate an operators document (already YAML/JSON-decoded). */
export function parseOperatorsDocument(document: unknown): OperatorsFile {
  const parsed = operatorsFileSchema.safeParse(document);
  const errors: string[] = [];

  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const path = issue.path.length > 0 ? issue.path.join(".") : "operators";
      errors.push(`${path}: ${issue.message}`);
    }
    throw new OperatorsValidationError(errors);
  }

  const normalized: OperatorsFile = {
    operators: parsed.data.operators.map((entry) => ({
      owner_id: entry.owner_id,
      ...(entry.google_sub?.trim()
        ? { google_sub: entry.google_sub.trim() }
        : {}),
      ...(entry.google_email?.trim()
        ? { google_email: entry.google_email.trim().toLowerCase() }
        : {}),
    })),
  };

  const uniqueErrors = uniquenessErrors(normalized.operators);
  if (uniqueErrors.length > 0) {
    throw new OperatorsValidationError(uniqueErrors);
  }

  return normalized;
}

export interface OperatorClaims {
  googleSub: string;
  email: string;
}

/**
 * Resolve opaque owner_id for Google claims. Prefer google_sub match;
 * fall back to google_email.
 */
export function resolveOwnerIdFromOperators(
  operators: readonly OperatorEntry[],
  claims: OperatorClaims,
): string | null {
  const bySub = operators.find(
    (entry) => entry.google_sub && entry.google_sub === claims.googleSub,
  );
  if (bySub) {
    return bySub.owner_id;
  }

  const email = claims.email.trim().toLowerCase();
  if (!email) {
    return null;
  }

  const byEmail = operators.find(
    (entry) => entry.google_email && entry.google_email === email,
  );
  return byEmail?.owner_id ?? null;
}

/** True when claims match any operator row (sub or email). */
export function isOperatorInRegistry(
  operators: readonly OperatorEntry[],
  claims: OperatorClaims,
): boolean {
  return resolveOwnerIdFromOperators(operators, claims) !== null;
}

/** Owner ids only — for Fuda owner reconcile and Torii OAuth grant wipe. */
export function ownerIdsFromOperators(
  operators: readonly OperatorEntry[],
): string[] {
  return operators.map((entry) => entry.owner_id);
}
