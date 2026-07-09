import { describe, expect, it } from "vitest";
import { findShaidenNavItem, shaidenNavItems } from "../navigation.js";

describe("findShaidenNavItem", () => {
  it("returns the nav item for an exact path match", () => {
    expect(findShaidenNavItem("/shaiden/runs")).toBe(shaidenNavItems[0]);
  });

  it("returns undefined for unknown paths", () => {
    expect(findShaidenNavItem("/missing")).toBeUndefined();
  });
});
