import type { GroupServerPolicyView } from "@keidai/shared";
import { describe, expect, it } from "vitest";
import { countGroupGrants, countServerGrants } from "../count-group-grants.js";
import type { ServerCatalogue } from "../../types/group-editor.js";

const gmail: GroupServerPolicyView = {
  server: "gmail",
  default: "deny",
  allow: ["messages.list"],
  deny: [],
  gated: ["messages.send"],
};

const drive: GroupServerPolicyView = {
  server: "drive",
  default: "allow",
  allow: [],
  deny: ["files.delete"],
  gated: ["permissions.grant"],
};

const gmailCat = [
  { name: "messages.send", description: "" },
  { name: "messages.list", description: "" },
  { name: "messages.get", description: "" },
];

const driveCat = [
  { name: "files.read", description: "" },
  { name: "files.delete", description: "" },
  { name: "permissions.grant", description: "" },
];

describe("countServerGrants", () => {
  it("counts gated toward reachable without changing when flipped to allow", () => {
    const gated = countServerGrants(gmail, gmailCat);
    expect(gated).toEqual({ reachable: 2, gated: 1, total: 3 });

    const allowed = countServerGrants(
      { ...gmail, allow: ["messages.list", "messages.send"], gated: [] },
      gmailCat,
    );
    expect(allowed.reachable).toBe(gated.reachable);
    expect(allowed.gated).toBe(0);
  });

  it("treats default allow as covering unnamed catalogue tools", () => {
    expect(countServerGrants(drive, driveCat)).toEqual({
      reachable: 2,
      gated: 1,
      total: 3,
    });
  });
});

describe("countGroupGrants", () => {
  it("sums catalogue-backed servers and flags missing catalogues", () => {
    const catalogues: Record<string, ServerCatalogue> = {
      gmail: { tools: gmailCat, available: true },
      drive: { tools: driveCat, available: true },
    };
    expect(countGroupGrants([gmail, drive], catalogues)).toEqual({
      allowed: 4,
      gated: 2,
      total: 6,
      catalogueComplete: true,
    });

    expect(countGroupGrants([gmail, drive], { gmail: catalogues.gmail })).toMatchObject({
      catalogueComplete: false,
    });
  });
});
