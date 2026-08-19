export interface OwnerRecord {
  ownerId: string;
  createdAt: string;
}

export interface OwnerRepository {
  upsert(ownerId: string): Promise<OwnerRecord>;
  get(ownerId: string): Promise<OwnerRecord | null>;
  list(): Promise<OwnerRecord[]>;
  /**
   * Deletes the owner. Caller is responsible for cascading dependents
   * (or using reconcileOwners which deletes agents first).
   */
  delete(ownerId: string): Promise<boolean>;
}

/** tsyringe injection token for {@link OwnerRepository}. */
export const OWNER_REPOSITORY = Symbol("OwnerRepository");
