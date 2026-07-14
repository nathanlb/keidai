import { describe, expect, it } from "vitest";
import { paginateItems } from "../paginate-items.js";

describe("paginateItems", () => {
  const items = Array.from({ length: 75 }, (_, index) => index);

  it("returns the first page", () => {
    const page = paginateItems(items, 0, 50);
    expect(page.pageItems).toHaveLength(50);
    expect(page.shownCount).toBe(50);
    expect(page.canGoNewer).toBe(false);
    expect(page.canGoOlder).toBe(true);
  });

  it("returns the second page", () => {
    const page = paginateItems(items, 1, 50);
    expect(page.pageItems).toHaveLength(25);
    expect(page.shownCount).toBe(25);
    expect(page.canGoNewer).toBe(true);
    expect(page.canGoOlder).toBe(false);
  });

  it("handles empty lists", () => {
    const page = paginateItems([], 0, 50);
    expect(page.pageItems).toEqual([]);
    expect(page.shownCount).toBe(0);
    expect(page.canGoNewer).toBe(false);
    expect(page.canGoOlder).toBe(false);
  });
});
