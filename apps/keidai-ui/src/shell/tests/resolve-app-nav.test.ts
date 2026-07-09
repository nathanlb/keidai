import { describe, expect, it } from "vitest";
import { resolveAppNav, resolveAppSection } from "../resolve-app-nav.js";

describe("resolveAppNav", () => {
  it("resolves Shaiden routes before Torii", () => {
    const nav = resolveAppNav("/shaiden/runs");
    expect(nav?.label).toBe("Runs");
    expect(resolveAppSection("/shaiden/runs")).toBe("Shaiden");
  });

  it("resolves Torii routes", () => {
    expect(resolveAppNav("/agents")?.label).toBe("Agents & owners");
    expect(resolveAppSection("/agents")).toBe("Torii");
  });
});
