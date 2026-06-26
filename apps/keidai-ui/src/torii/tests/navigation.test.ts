import { describe, expect, it } from "vitest";
import { findToriiNavItem, toriiNavItems } from "../navigation.js";

describe("findToriiNavItem", () => {
  it("returns the nav item for an exact path match", () => {
    expect(findToriiNavItem("/agents")).toBe(toriiNavItems[2]);
  });

  it("returns undefined for unknown paths", () => {
    expect(findToriiNavItem("/missing")).toBeUndefined();
  });
});
