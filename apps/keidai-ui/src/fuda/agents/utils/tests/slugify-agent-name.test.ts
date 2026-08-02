import { describe, expect, it } from "vitest";
import { slugifyAgentName } from "../slugify-agent-name.js";

describe("slugifyAgentName", () => {
  it("lowercases and dash-separates words", () => {
    expect(slugifyAgentName("Newsletter Writer")).toBe("newsletter-writer");
  });

  it("collapses non-alphanumeric runs into a single dash", () => {
    expect(slugifyAgentName("Triage Bot!! v2.0")).toBe("triage-bot-v2-0");
  });

  it("trims leading and trailing dashes", () => {
    expect(slugifyAgentName("  -Demo Agent- ")).toBe("demo-agent");
  });

  it("returns an empty string for input with no alphanumerics", () => {
    expect(slugifyAgentName("***")).toBe("");
  });
});
