import { describe, expect, it } from "vitest";
import { deriveOwnerInitials } from "../derive-owner-initials.js";

describe("deriveOwnerInitials", () => {
  it("uses the first character of the first two hyphen segments", () => {
    expect(deriveOwnerInitials("alice-smith")).toBe("AS");
  });

  it("uses the first character of the first two underscore segments", () => {
    expect(deriveOwnerInitials("team_alpha")).toBe("TA");
  });

  it("falls back to the first two characters for a single segment", () => {
    expect(deriveOwnerInitials("owner")).toBe("OW");
  });

  it("uppercases the result", () => {
    expect(deriveOwnerInitials("demo-user")).toBe("DU");
  });
});
