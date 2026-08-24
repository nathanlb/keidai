import type { GroupView } from "@keidai/shared";
import { describe, expect, it } from "vitest";
import { filterJoinableGroups } from "../filter-joinable-groups.js";

const opsWrite: GroupView = {
  id: "grp-1",
  name: "ops-write",
  description: "Day-to-day write access",
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
  servers: [],
};

const financeRead: GroupView = {
  id: "grp-2",
  name: "finance-read",
  description: "Read-only ledger access",
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
  servers: [],
};

describe("filterJoinableGroups", () => {
  it("omits groups the agent already belongs to", () => {
    expect(filterJoinableGroups([opsWrite, financeRead], ["ops-write"], "")).toEqual(
      [financeRead],
    );
  });

  it("filters by name or description and never invents a group", () => {
    expect(
      filterJoinableGroups([opsWrite, financeRead], [], "ledger"),
    ).toEqual([financeRead]);
    expect(
      filterJoinableGroups([opsWrite, financeRead], [], "not-a-real-group"),
    ).toEqual([]);
  });
});
