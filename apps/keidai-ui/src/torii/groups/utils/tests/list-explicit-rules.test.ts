import type { GroupServerPolicyView } from "@keidai/shared";
import { describe, expect, it } from "vitest";
import {
  filterCatalogueTools,
  listExplicitRules,
  listUnruledTools,
} from "../list-explicit-rules.js";

const gmailPolicy: GroupServerPolicyView = {
  server: "gmail",
  default: "deny",
  allow: ["messages.list", "stale.tool"],
  deny: [],
  gated: ["messages.send"],
};

const catalogue = [
  { name: "messages.send", description: "Send a message" },
  { name: "messages.list", description: "List messages" },
  { name: "messages.get", description: "Read a message" },
];

describe("listExplicitRules", () => {
  it("renders only named tools, catalogue-first, with stale names last", () => {
    const rows = listExplicitRules(gmailPolicy, catalogue);
    expect(rows.map((row) => row.name)).toEqual([
      "messages.send",
      "messages.list",
      "stale.tool",
    ]);
    expect(rows[0]).toMatchObject({
      effect: "gated",
      advertised: true,
      description: "Send a message",
    });
    expect(rows[2]).toMatchObject({
      name: "stale.tool",
      advertised: false,
      description: "Not currently advertised",
      effect: "allowed",
    });
  });

  it("still lists stored names when the catalogue is empty", () => {
    const rows = listExplicitRules(gmailPolicy, []);
    expect(rows.map((row) => row.name)).toEqual([
      "messages.list",
      "stale.tool",
      "messages.send",
    ]);
    expect(rows.every((row) => row.advertised === false)).toBe(true);
  });
});

describe("listUnruledTools", () => {
  it("returns catalogue tools the policy does not name", () => {
    expect(listUnruledTools(gmailPolicy, catalogue).map((tool) => tool.name)).toEqual([
      "messages.get",
    ]);
  });
});

describe("filterCatalogueTools", () => {
  it("matches name or description", () => {
    expect(
      filterCatalogueTools(catalogue, "read").map((tool) => tool.name),
    ).toEqual(["messages.get"]);
    expect(
      filterCatalogueTools(catalogue, "messages.list").map((tool) => tool.name),
    ).toEqual(["messages.list"]);
  });
});
