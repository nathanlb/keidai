import { describe, expect, it } from "vitest";
import { deriveAgentInitials } from "../derive-agent-initials.js";

describe("deriveAgentInitials", () => {
  it("takes the first letter of the first two words", () => {
    expect(deriveAgentInitials("Demo Agent")).toBe("DA");
    expect(deriveAgentInitials("Newsletter Writer")).toBe("NW");
  });

  it("splits on dashes as well as whitespace", () => {
    expect(deriveAgentInitials("triage-bot")).toBe("TB");
  });

  it("falls back to the first two characters for a single word", () => {
    expect(deriveAgentInitials("Scout")).toBe("SC");
  });
});
