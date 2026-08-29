import { describe, expect, it } from "vitest";
import {
  resolveAppNav,
  resolveAppNavSection,
  resolveAppSection,
} from "../navigation.js";

describe("resolveAppNavSection", () => {
  it("maps work and gateway routes to their sections", () => {
    expect(resolveAppNavSection("/agents")?.id).toBe("work");
    expect(resolveAppNavSection("/agents/agt-1")?.id).toBe("work");
    expect(resolveAppNavSection("/tasks")?.id).toBe("work");
    expect(resolveAppNavSection("/runs/4821")?.id).toBe("work");
    expect(resolveAppNavSection("/approvals")?.id).toBe("work");
    expect(resolveAppNavSection("/activity")?.id).toBe("gateway");
    expect(resolveAppNavSection("/connections")?.id).toBe("gateway");
    expect(resolveAppNavSection("/groups")?.id).toBe("gateway");
    expect(resolveAppNavSection("/groups/ops-write")?.id).toBe("gateway");
  });

  it("returns undefined for Home, retired configure paths, and unknown routes", () => {
    expect(resolveAppNavSection("/home")).toBeUndefined();
    expect(resolveAppNavSection("/configure")).toBeUndefined();
    expect(resolveAppNavSection("/configure/groups")).toBeUndefined();
    expect(resolveAppNavSection("/configure/groups/ops-write")).toBeUndefined();
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
    expect(resolveAppNav("/connections")?.label).toBe("Connections");
    expect(resolveAppNav("/activity")?.label).toBe("Activity");
    expect(resolveAppNav("/groups")?.label).toBe("Policy Groups");
    expect(resolveAppNav("/groups/ops-write")?.label).toBe("Policy Groups");
  });

  it("resolves section labels from the URL", () => {
    expect(resolveAppSection("/activity")).toBe("Gateway");
    expect(resolveAppSection("/connections")).toBe("Gateway");
    expect(resolveAppSection("/groups")).toBe("Gateway");
    expect(resolveAppSection("/agents")).toBe("Work");
    expect(resolveAppSection("/runs/4821")).toBe("Work");
    expect(resolveAppSection("/home")).toBe("");
  });

  it("does not treat bearers, retired configure paths, or old service paths as nav items", () => {
    expect(resolveAppNav("/configure/providers")).toBeUndefined();
    expect(resolveAppNav("/configure/groups")).toBeUndefined();
    expect(resolveAppNav("/configure/groups/ops-write")).toBeUndefined();
    expect(resolveAppNav("/bearers")).toBeUndefined();
    expect(resolveAppNav("/bearers/br_1")).toBeUndefined();
    expect(resolveAppNav("/oauth-providers")).toBeUndefined();
    expect(resolveAppNav("/shaiden/tasks")).toBeUndefined();
    expect(resolveAppNav("/shaiden/runs")).toBeUndefined();
    expect(resolveAppSection("/configure/connections")).toBe("");
  });
});
