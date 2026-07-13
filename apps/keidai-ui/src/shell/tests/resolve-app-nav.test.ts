import { describe, expect, it } from "vitest";
import { resolveAppNav, resolveAppSection } from "../resolve-app-nav.js";

describe("resolveAppNav", () => {
  it("resolves Shaiden routes before Torii", () => {
    expect(resolveAppNav("/shaiden/tasks")?.label).toBe("Tasks");
    expect(resolveAppNav("/shaiden/runs")?.label).toBe("Runs");
    expect(resolveAppSection("/shaiden/runs")).toBe("Shaiden");
  });

  it("resolves Torii routes", () => {
    expect(resolveAppNav("/agents")?.label).toBe("Agents & owners");
    expect(resolveAppSection("/agents")).toBe("Torii");
  });
});
