import { describe, expect, it } from "vitest";
import { findFudaNavItem, fudaNavItems } from "../navigation.js";

describe("findFudaNavItem", () => {
  it("returns the agents nav item for list and nested agent routes", () => {
    expect(findFudaNavItem("/agents")).toBe(fudaNavItems[0]);
    expect(findFudaNavItem("/agents/new")).toBe(fudaNavItems[0]);
    expect(findFudaNavItem("/agents/agt-1")).toBe(fudaNavItems[0]);
  });

  it("does not expose bearers as a nav item", () => {
    expect(findFudaNavItem("/bearers")).toBeUndefined();
    expect(findFudaNavItem("/bearers/new")).toBeUndefined();
  });

  it("returns undefined for unknown paths", () => {
    expect(findFudaNavItem("/missing")).toBeUndefined();
  });
});
