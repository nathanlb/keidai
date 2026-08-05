import { describe, expect, it } from "vitest";
import { generateBearerId } from "../generate-bearer-id.js";

describe("generateBearerId", () => {
  it("returns br_ followed by 6 hex characters", () => {
    expect(generateBearerId()).toMatch(/^br_[0-9a-f]{6}$/);
  });

  it("returns distinct values across calls", () => {
    const ids = new Set(Array.from({ length: 20 }, () => generateBearerId()));
    expect(ids.size).toBeGreaterThan(1);
  });
});
