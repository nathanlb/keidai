import { describe, expect, it } from "vitest";
import {
  findFudaNavItem,
  fudaNavItems,
  isFudaBearersRoute,
} from "../navigation.js";

describe("findFudaNavItem", () => {
  it("returns the agents nav item for list and nested agent routes", () => {
    expect(findFudaNavItem("/agents")).toBe(fudaNavItems[0]);
    expect(findFudaNavItem("/agents/new")).toBe(fudaNavItems[0]);
    expect(findFudaNavItem("/agents/agt-1")).toBe(fudaNavItems[0]);
  });

  it("returns the bearers nav item for list and nested bearer routes", () => {
    expect(findFudaNavItem("/bearers")).toBe(fudaNavItems[1]);
    expect(findFudaNavItem("/bearers/new")).toBe(fudaNavItems[1]);
    expect(findFudaNavItem("/bearers/br_abc123")).toBe(fudaNavItems[1]);
    expect(isFudaBearersRoute("/bearers/br_abc123")).toBe(true);
  });

  it("returns undefined for unknown paths", () => {
    expect(findFudaNavItem("/missing")).toBeUndefined();
  });
});
