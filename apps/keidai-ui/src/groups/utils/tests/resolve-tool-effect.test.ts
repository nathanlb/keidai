import type { GroupServerPolicyView } from "@keidai/shared";
import { describe, expect, it } from "vitest";
import {
  resolveEffectivePermission,
  resolveToolEffect,
} from "../resolve-tool-effect.js";

const policy = (overrides: Partial<GroupServerPolicyView> = {}): GroupServerPolicyView => ({
  server: "gmail",
  default: "deny",
  allow: ["messages.list"],
  deny: ["messages.delete"],
  gated: ["messages.send"],
  ...overrides,
});

describe("resolveToolEffect", () => {
  it("resolves gated before deny, deny before allow, else default", () => {
    const mixed = policy({
      allow: ["messages.send", "messages.list"],
      deny: ["messages.send"],
      gated: ["messages.send"],
    });

    expect(resolveToolEffect(mixed, "messages.send")).toBe("gated");
    expect(resolveToolEffect(policy(), "messages.delete")).toBe("denied");
    expect(resolveToolEffect(policy(), "messages.list")).toBe("allowed");
    expect(resolveToolEffect(policy(), "labels.apply")).toBe("default");
  });
});

describe("resolveEffectivePermission", () => {
  it("treats an unnamed tool as the policy default", () => {
    expect(resolveEffectivePermission(policy(), "labels.apply")).toBe("denied");
    expect(
      resolveEffectivePermission(policy({ default: "allow" }), "labels.apply"),
    ).toBe("allowed");
  });

  it("counts gated as permitted", () => {
    expect(resolveEffectivePermission(policy(), "messages.send")).toBe("gated");
  });
});
