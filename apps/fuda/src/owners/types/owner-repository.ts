export interface OwnerRecord {
  ownerId: string;
  createdAt: string;
}

export interface OwnerRepository {
  upsert(ownerId: string): OwnerRecord;
  get(ownerId: string): OwnerRecord | null;
  list(): OwnerRecord[];
  /**
   * Deletes the owner. Caller is responsible for cascading dependents
   * (or using reconcileOwners which deletes agents first).
   */
  delete(ownerId: string): boolean;
}

/** tsyringe injection token for {@link OwnerRepository}. */
export const OWNER_REPOSITORY = Symbol("OwnerRepository");
