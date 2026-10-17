import { deriveOwnerId } from "./derive-owner-id.js";
import type {
  OwnerIdentityInput,
  OwnerRecord,
  OwnerRepository,
} from "./types/owner-repository.js";

export interface ResolveOrProvisionOwnerInput extends OwnerIdentityInput {
  /** Allowlist or pre-seed hint. Used when this IdP subject is not bound yet. */
  ownerId?: string;
}

export type ResolveOrProvisionOwnerResult =
  | { ok: true; owner: OwnerRecord }
  | { ok: false; reason: "disabled"; owner: OwnerRecord };

async function allocateOwnerId(
  owners: OwnerRepository,
  base: string,
): Promise<string> {
  if (!(await owners.get(base))) {
    return base;
  }
  for (let suffix = 2; suffix < 1000; suffix += 1) {
    const candidate = `${base}-${suffix}`;
    if (!(await owners.get(candidate))) {
      return candidate;
    }
  }
  throw new Error(`exhausted owner id candidates for "${base}"`);
}

function identityOf(input: ResolveOrProvisionOwnerInput): OwnerIdentityInput {
  return {
    idpIssuer: input.idpIssuer,
    idpSub: input.idpSub,
    email: input.email,
    ...(input.displayName ? { displayName: input.displayName } : {}),
    ...(input.pictureUrl ? { pictureUrl: input.pictureUrl } : {}),
  };
}

/** True when the row has no IdP subject yet, or already has this subject. */
function canBind(owner: OwnerRecord, input: OwnerIdentityInput): boolean {
  if (!owner.idpIssuer && !owner.idpSub) {
    return true;
  }
  return owner.idpIssuer === input.idpIssuer && owner.idpSub === input.idpSub;
}

async function bindOrReject(
  owners: OwnerRepository,
  owner: OwnerRecord,
  identity: OwnerIdentityInput,
): Promise<ResolveOrProvisionOwnerResult | null> {
  if (!canBind(owner, identity)) {
    return null;
  }
  if (owner.status === "disabled") {
    return { ok: false, reason: "disabled", owner };
  }
  const updated = await owners.updateIdentity(owner.ownerId, identity);
  if (!updated) {
    throw new Error(`owner "${owner.ownerId}" disappeared during login`);
  }
  return { ok: true, owner: updated };
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "23505"
  );
}

async function resolveExistingByIdp(
  owners: OwnerRepository,
  identity: OwnerIdentityInput,
): Promise<ResolveOrProvisionOwnerResult | null> {
  const byIdp = await owners.getByIdp(identity.idpIssuer, identity.idpSub);
  if (!byIdp) {
    return null;
  }
  if (byIdp.status === "disabled") {
    return { ok: false, reason: "disabled", owner: byIdp };
  }
  const updated = await owners.updateIdentity(byIdp.ownerId, identity);
  if (!updated) {
    throw new Error(`owner "${byIdp.ownerId}" disappeared during login`);
  }
  return { ok: true, owner: updated };
}

/**
 * Resolves an OIDC subject to an owner, creating one on first login.
 * An existing subject keeps its owner id across email and display-name changes.
 * A disabled owner is returned without refreshing profile fields.
 */
export async function resolveOrProvisionOwner(
  owners: OwnerRepository,
  input: ResolveOrProvisionOwnerInput,
): Promise<ResolveOrProvisionOwnerResult> {
  const identity = identityOf(input);

  const existingByIdp = await resolveExistingByIdp(owners, identity);
  if (existingByIdp) {
    return existingByIdp;
  }

  if (input.ownerId) {
    const hinted = await owners.get(input.ownerId);
    if (hinted) {
      const bound = await bindOrReject(owners, hinted, identity);
      if (bound) {
        return bound;
      }
    } else {
      try {
        const created = await owners.insertProvisioned(input.ownerId, identity);
        return { ok: true, owner: created };
      } catch (error) {
        if (!isUniqueViolation(error)) {
          throw error;
        }
        const racedByIdp = await resolveExistingByIdp(owners, identity);
        if (racedByIdp) {
          return racedByIdp;
        }
        const racedHint = await owners.get(input.ownerId);
        if (racedHint) {
          const bound = await bindOrReject(owners, racedHint, identity);
          if (bound) {
            return bound;
          }
        }
      }
    }
  } else {
    const byEmail = await owners.getUnboundByEmail(input.email);
    if (byEmail) {
      const bound = await bindOrReject(owners, byEmail, identity);
      if (bound) {
        return bound;
      }
    }
  }

  const baseId = deriveOwnerId(input.email);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidateId = await allocateOwnerId(owners, baseId);
    try {
      const created = await owners.insertProvisioned(candidateId, identity);
      return { ok: true, owner: created };
    } catch (error) {
      if (!isUniqueViolation(error)) {
        throw error;
      }
      const racedByIdp = await resolveExistingByIdp(owners, identity);
      if (racedByIdp) {
        return racedByIdp;
      }
    }
  }
  throw new Error(`exhausted owner id retries for "${baseId}"`);
}
