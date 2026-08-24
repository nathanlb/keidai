import type { GroupServerPolicyView } from "@keidai/shared";
import { describe, expect, it } from "vitest";
import {
  addServerPolicy,
  invertedDefaultEffect,
  removeServerPolicy,
  removeToolRule,
  setServerDefault,
  setToolRule,
} from "../mutate-server-policy.js";

const base = (): GroupServerPolicyView => ({
  server: "gmail",
  default: "deny",
  allow: ["messages.list"],
  deny: [],
  gated: ["messages.send"],
});

describe("setToolRule", () => {
  it("moves a tool into exactly one list", () => {
    const gated = setToolRule(base(), "messages.list", "gated");
    expect(gated.allow).toEqual([]);
    expect(gated.deny).toEqual([]);
    expect(gated.gated).toEqual(["messages.send", "messages.list"]);

    const denied = setToolRule(gated, "messages.send", "denied");
    expect(denied.gated).toEqual(["messages.list"]);
    expect(denied.deny).toEqual(["messages.send"]);
  });
});

describe("removeToolRule", () => {
  it("strips the tool from every list so it falls back to the default", () => {
    expect(removeToolRule(base(), "messages.send")).toEqual({
      server: "gmail",
      default: "deny",
      allow: ["messages.list"],
      deny: [],
      gated: [],
    });
  });
});

describe("invertedDefaultEffect", () => {
  it("adds a new rule as the opposite of the default", () => {
    expect(invertedDefaultEffect("deny")).toBe("allowed");
    expect(invertedDefaultEffect("allow")).toBe("denied");
  });
});

describe("setServerDefault", () => {
  it("leaves explicit rules in place", () => {
    const next = setServerDefault(base(), "allow");
    expect(next.default).toBe("allow");
    expect(next.allow).toEqual(["messages.list"]);
    expect(next.gated).toEqual(["messages.send"]);
  });
});

describe("addServerPolicy / removeServerPolicy", () => {
  it("appends a fail-closed server and can drop it", () => {
    const withSlack = addServerPolicy([base()], "slack");
    expect(withSlack).toHaveLength(2);
    expect(withSlack[1]).toEqual({
      server: "slack",
      default: "deny",
      allow: [],
      deny: [],
      gated: [],
    });
    expect(addServerPolicy(withSlack, "slack")).toHaveLength(2);
    expect(removeServerPolicy(withSlack, "gmail")).toEqual([withSlack[1]]);
  });
});
