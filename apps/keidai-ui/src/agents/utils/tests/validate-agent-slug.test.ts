import { describe, expect, it } from "vitest";
import { validateAgentSlug } from "../validate-agent-slug.js";

describe("validateAgentSlug", () => {
  it("flags empty input", () => {
    expect(validateAgentSlug("")).toBe("empty");
    expect(validateAgentSlug("   ")).toBe("empty");
  });

  it("accepts lowercase letters, numbers, and single dashes", () => {
    expect(validateAgentSlug("newsletter-writer")).toBe("valid");
    expect(validateAgentSlug("agent2")).toBe("valid");
  });

  it("rejects uppercase letters", () => {
    expect(validateAgentSlug("Newsletter-Writer")).toBe("invalid");
  });

  it("rejects spaces and consecutive dashes", () => {
    expect(validateAgentSlug("newsletter writer")).toBe("invalid");
    expect(validateAgentSlug("newsletter--writer")).toBe("invalid");
  });

  it("rejects leading or trailing dashes", () => {
    expect(validateAgentSlug("-newsletter")).toBe("invalid");
    expect(validateAgentSlug("newsletter-")).toBe("invalid");
  });
});
