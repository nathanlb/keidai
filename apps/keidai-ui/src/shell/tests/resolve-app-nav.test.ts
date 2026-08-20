import { describe, expect, it } from "vitest";
import { resolveAppNav, resolveAppSection } from "../resolve-app-nav.js";

describe("resolveAppNav", () => {
  it("resolves Shaiden routes before Torii", () => {
    expect(resolveAppNav("/shaiden/tasks")?.label).toBe("Tasks");
    expect(resolveAppNav("/shaiden/runs")?.label).toBe("Runs");
    expect(resolveAppSection("/shaiden/runs")).toBe("Shaiden");
  });

  it("resolves Fuda routes", () => {
    expect(resolveAppNav("/agents")?.label).toBe("Agents");
    expect(resolveAppNav("/agents/new")?.label).toBe("Agents");
    expect(resolveAppNav("/bearers")).toBeUndefined();
    expect(resolveAppSection("/agents")).toBe("Fuda");
    expect(resolveAppSection("/agents/agt-1")).toBe("Fuda");
    expect(resolveAppSection("/bearers")).toBe("Fuda");
    expect(resolveAppSection("/bearers/br_1")).toBe("Fuda");
  });

  it("resolves Torii routes", () => {
    expect(resolveAppNav("/connections")?.label).toBe("Connections");
    expect(resolveAppSection("/connections")).toBe("Torii");
  });
});
