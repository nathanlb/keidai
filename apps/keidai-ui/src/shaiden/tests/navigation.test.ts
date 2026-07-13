import { describe, expect, it } from "vitest";
import {
  findShaidenNavItem,
  NEW_TASK_HREF,
  NEW_TASK_PARAM,
  shaidenNavItems,
  TASKS_PATH,
} from "../navigation.js";

describe("findShaidenNavItem", () => {
  it("returns the nav item for an exact path match", () => {
    expect(findShaidenNavItem(TASKS_PATH)).toBe(shaidenNavItems[0]);
    expect(findShaidenNavItem("/shaiden/runs")).toBe(shaidenNavItems[1]);
  });

  it("returns undefined for unknown paths", () => {
    expect(findShaidenNavItem("/missing")).toBeUndefined();
  });
});

describe("task authoring deep links", () => {
  it("opens the dialog over runs via query param", () => {
    expect(NEW_TASK_HREF).toBe(`/shaiden/runs?${NEW_TASK_PARAM}=1`);
  });
});
