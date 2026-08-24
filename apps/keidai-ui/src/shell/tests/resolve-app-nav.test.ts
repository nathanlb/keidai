import { describe, expect, it } from "vitest";
import {
  resolveAppNav,
  resolveAppNavSection,
  resolveAppSection,
  resolveNavMode,
} from "../navigation.js";

describe("resolveNavMode", () => {
  it("treats /configure and its children as configure mode", () => {
    expect(resolveNavMode("/configure")).toBe("configure");
    expect(resolveNavMode("/configure/connections")).toBe("configure");
    expect(resolveNavMode("/configure/providers")).toBe("configure");
    expect(resolveNavMode("/configure/groups")).toBe("configure");
  });

  it("treats every other path as workspace mode", () => {
    expect(resolveNavMode("/home")).toBe("workspace");
    expect(resolveNavMode("/agents")).toBe("workspace");
    expect(resolveNavMode("/runs/4821")).toBe("workspace");
    expect(resolveNavMode("/approvals")).toBe("workspace");
    expect(resolveNavMode("/activity")).toBe("workspace");
  });
});

describe("resolveAppNavSection", () => {
  it("maps workspace routes to Operate and Observe sections", () => {
    expect(resolveAppNavSection("/agents")?.id).toBe("operate");
    expect(resolveAppNavSection("/agents/agt-1")?.id).toBe("operate");
    expect(resolveAppNavSection("/tasks")?.id).toBe("operate");
    expect(resolveAppNavSection("/runs/4821")?.id).toBe("operate");
    expect(resolveAppNavSection("/approvals")?.id).toBe("operate");
    expect(resolveAppNavSection("/activity")?.id).toBe("observe");
  });

  it("maps configure routes to the Configure section", () => {
    expect(resolveAppNavSection("/configure")?.id).toBe("configure");
    expect(resolveAppNavSection("/configure/connections")?.id).toBe(
      "configure",
    );
    expect(resolveAppNavSection("/configure/groups/ops-write")?.id).toBe(
      "configure",
    );
  });

  it("returns undefined for Home and unknown routes", () => {
    expect(resolveAppNavSection("/home")).toBeUndefined();
    expect(resolveAppNavSection("/bearers")).toBeUndefined();
  });
});

describe("resolveAppNav", () => {
  it("resolves workspace routes including nested agent/task/run paths", () => {
    expect(resolveAppNav("/home")?.label).toBe("Home");
    expect(resolveAppNav("/agents")?.label).toBe("Agents");
    expect(resolveAppNav("/agents/new")?.label).toBe("Agents");
    expect(resolveAppNav("/agents/agt-1")?.label).toBe("Agents");
    expect(resolveAppNav("/tasks")?.label).toBe("Tasks");
    expect(resolveAppNav("/tasks/task-1")?.label).toBe("Tasks");
    expect(resolveAppNav("/runs")?.label).toBe("Runs");
    expect(resolveAppNav("/runs/4821")?.label).toBe("Runs");
    expect(resolveAppNav("/approvals")?.label).toBe("Approvals");
    expect(resolveAppNav("/activity")?.label).toBe("Gateway activity");
  });

  it("resolves configure routes from the URL", () => {
    expect(resolveAppNav("/configure/connections")?.label).toBe("Connections");
    expect(resolveAppNav("/configure/providers")?.label).toBe("OAuth providers");
    expect(resolveAppNav("/configure/groups")?.label).toBe("Groups & tools");
    expect(resolveAppNav("/configure/groups/ops-write")?.label).toBe(
      "Groups & tools",
    );
    expect(resolveAppSection("/configure/connections")).toBe("Configure");
    expect(resolveAppSection("/activity")).toBe("Observe");
    expect(resolveAppSection("/agents")).toBe("Operate");
    expect(resolveAppSection("/runs/4821")).toBe("Operate");
  });

  it("does not treat bearers or retired service paths as nav items", () => {
    expect(resolveAppNav("/bearers")).toBeUndefined();
    expect(resolveAppNav("/bearers/br_1")).toBeUndefined();
    expect(resolveAppNav("/connections")).toBeUndefined();
    expect(resolveAppNav("/oauth-providers")).toBeUndefined();
    expect(resolveAppNav("/shaiden/tasks")).toBeUndefined();
    expect(resolveAppNav("/shaiden/runs")).toBeUndefined();
    expect(resolveAppSection("/home")).toBe("");
  });
});
