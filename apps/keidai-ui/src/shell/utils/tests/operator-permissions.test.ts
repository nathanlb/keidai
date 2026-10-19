import { describe, expect, it } from "vitest";
import { ownerRowLocks, type OwnerRecord } from "../../../lib/api/owners.js";
import {
  canApproveToolCall,
  canArchiveTask,
  canMutateOwned,
  canMutateWorkspace,
  canRejectOrCancel,
  canRunOwnAgent,
  knownOperator,
} from "../operator-permissions.js";

const admin = knownOperator({ ownerId: "boss", role: "admin" });
const member = knownOperator({ ownerId: "ada", role: "member" });

function owner(overrides: Partial<OwnerRecord> = {}): OwnerRecord {
  return {
    ownerId: "ada",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    status: "active",
    role: "admin",
    email: "ada@example.com",
    displayName: "Ada",
    pictureUrl: null,
    ...overrides,
  };
}

describe("operator permissions", () => {
  it("lets admins mutate workspace resources and members only their own", () => {
    expect(canMutateWorkspace(admin)).toBe(true);
    expect(canMutateWorkspace(member)).toBe(false);
    expect(canMutateOwned(member, "ada")).toBe(true);
    expect(canMutateOwned(member, "bob")).toBe(false);
    expect(canMutateOwned(member, null)).toBe(false);
    expect(canMutateOwned(admin, "bob")).toBe(true);
  });

  it("keeps task runs owner-only and lets admins archive any task", () => {
    expect(canRunOwnAgent(admin, "ada")).toBe(false);
    expect(canRunOwnAgent(member, "ada")).toBe(true);
    expect(canArchiveTask(admin, "ada")).toBe(true);
    expect(canArchiveTask(member, "bob")).toBe(false);
  });

  it("lets only the owner approve, and admins reject", () => {
    expect(canApproveToolCall(admin, "ada")).toBe(false);
    expect(canApproveToolCall(member, "ada")).toBe(true);
    expect(canRejectOrCancel(admin, "ada")).toBe(true);
    expect(canRejectOrCancel(member, "bob")).toBe(false);
  });

  it("locks self-demotion and the last active admin", () => {
    const self = ownerRowLocks(owner(), "ada", 1);
    expect(self).toEqual({ role: true, status: true, delete: true });

    const otherAdmin = ownerRowLocks(
      owner({ ownerId: "boss", email: "boss@example.com" }),
      "ada",
      2,
    );
    expect(otherAdmin).toEqual({ role: false, status: false, delete: false });

    const selfWithPeer = ownerRowLocks(owner(), "ada", 2);
    expect(selfWithPeer).toEqual({ role: true, status: false, delete: true });
  });
});
