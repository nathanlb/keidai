import type { OperatorRole } from "@keidai/shared";
import { fetchJson, fetchJsonWithBody, sendNoContent } from "./fetch-json.js";

export type OwnerStatus = "active" | "disabled";

export interface OwnerRecord {
  ownerId: string;
  createdAt: string;
  updatedAt: string;
  status: OwnerStatus;
  role: OperatorRole;
  email: string | null;
  displayName: string | null;
  pictureUrl: string | null;
}

export function fetchOwners(): Promise<{ owners: OwnerRecord[] }> {
  return fetchJson("/api/owners");
}

export function updateOwner(
  ownerId: string,
  patch: { role?: OperatorRole; status?: OwnerStatus },
): Promise<{ owner: OwnerRecord }> {
  return fetchJsonWithBody(`/api/owners/${encodeURIComponent(ownerId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
}

export function deleteOwner(ownerId: string): Promise<void> {
  return sendNoContent(`/api/owners/${encodeURIComponent(ownerId)}`, {
    method: "DELETE",
  });
}

export function activeAdminCount(owners: readonly OwnerRecord[]): number {
  return owners.filter(
    (owner) => owner.status === "active" && owner.role === "admin",
  ).length;
}

export interface OwnerRowLocks {
  role: boolean;
  status: boolean;
  delete: boolean;
}

/** Self cannot demote or delete their own row. The last active admin cannot be removed. */
export function ownerRowLocks(
  owner: OwnerRecord,
  currentOwnerId: string | undefined,
  admins: number,
): OwnerRowLocks {
  const isSelf = owner.ownerId === currentOwnerId;
  const isLastAdmin =
    admins <= 1 && owner.role === "admin" && owner.status === "active";
  return {
    role: isSelf || isLastAdmin,
    status: isLastAdmin,
    delete: isSelf || isLastAdmin,
  };
}
