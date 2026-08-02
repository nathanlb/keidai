import { describe, expect, it } from "vitest";
import { findToriiNavItem, toriiNavItems } from "../navigation.js";

describe("findToriiNavItem", () => {
  it("returns the nav item for an exact path match", () => {
    expect(findToriiNavItem("/connections")).toBe(toriiNavItems[0]);
  });

  it("returns undefined for Fuda-owned agent routes", () => {
    expect(findToriiNavItem("/agents")).toBeUndefined();
  });

  it("returns undefined for unknown paths", () => {
    expect(findToriiNavItem("/missing")).toBeUndefined();
  });
});
