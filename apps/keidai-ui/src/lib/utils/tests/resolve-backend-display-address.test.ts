import { describe, expect, it } from "vitest";
import { resolveBackendDisplayAddress } from "../resolve-backend-display-address.js";

describe("resolveBackendDisplayAddress", () => {
  it("parses host:port from a valid URL", () => {
    expect(
      resolveBackendDisplayAddress(
        "VITE_SHAIDEN_URL",
        "http://127.0.0.1:3200",
      ),
    ).toBe("127.0.0.1:3200");
  });

  it("surfaces unset env names instead of inventing a localhost default", () => {
    expect(resolveBackendDisplayAddress("VITE_SHAIDEN_URL", undefined)).toBe(
      "VITE_SHAIDEN_URL unset",
    );
    expect(resolveBackendDisplayAddress("VITE_SHAIDEN_URL", "  ")).toBe(
      "VITE_SHAIDEN_URL unset",
    );
  });

  it("surfaces invalid URLs instead of inventing a localhost default", () => {
    expect(resolveBackendDisplayAddress("VITE_FUDA_URL", "not-a-url")).toBe(
      "VITE_FUDA_URL invalid",
    );
  });
});
