import type { OperatorRole } from "@keidai/shared";

export type OwnerStatus = "active" | "disabled";

export interface OwnerRecord {
  ownerId: string;
  createdAt: string;
  updatedAt: string;
  status: OwnerStatus;
  role: OperatorRole;
  idpIssuer: string | null;
  idpSub: string | null;
  email: string | null;
  displayName: string | null;
  pictureUrl: string | null;
}

export interface OwnerIdentityInput {
  idpIssuer: string;
  idpSub: string;
  email: string;
  displayName?: string;
  pictureUrl?: string;
}

/** tsyringe injection token for {@link OwnerRepository}. */
export const OWNER_REPOSITORY = Symbol("OwnerRepository");

export interface OwnerRepository {
  /** Inserts an owner id when missing. Does not overwrite profile columns. */
  upsert(
    ownerId: string,
    options?: { role?: OperatorRole },
  ): Promise<OwnerRecord>;
  /** Sets email only while the column is still null (file seed, not a login). */
  setEmailIfAbsent(ownerId: string, email: string): Promise<void>;
  get(ownerId: string): Promise<OwnerRecord | null>;
  getByIdp(idpIssuer: string, idpSub: string): Promise<OwnerRecord | null>;
  /** Email match that has not yet been bound to an IdP subject. */
  getUnboundByEmail(email: string): Promise<OwnerRecord | null>;
  list(): Promise<OwnerRecord[]>;
  countActiveAdmins(): Promise<number>;
  insertProvisioned(
    ownerId: string,
    identity: OwnerIdentityInput,
    role: OperatorRole,
  ): Promise<OwnerRecord>;
  updateIdentity(
    ownerId: string,
    identity: OwnerIdentityInput,
  ): Promise<OwnerRecord | null>;
  setStatus(ownerId: string, status: OwnerStatus): Promise<OwnerRecord | null>;
  update(
    ownerId: string,
    patch: { status?: OwnerStatus; role?: OperatorRole },
  ): Promise<OwnerRecord | null>;
  /**
   * Deletes the owner. Caller is responsible for cascading dependents
   * (or using deleteOwner which deletes agents first).
   */
  delete(ownerId: string): Promise<boolean>;
}
