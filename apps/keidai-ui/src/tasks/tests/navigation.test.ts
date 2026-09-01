import { describe, expect, it } from "vitest";
import {
  isTaskAuthoringRoute,
  taskCreateHref,
  taskEditHref,
  TASKS_NEW_PATH,
  TASKS_PATH,
} from "../navigation.js";

describe("task authoring paths", () => {
  it("matches agent-style create and edit hrefs", () => {
    expect(TASKS_PATH).toBe("/tasks");
    expect(TASKS_NEW_PATH).toBe("/tasks/new");
    expect(taskCreateHref()).toBe("/tasks/new");
    expect(taskCreateHref({ assignee: "agt-1" })).toBe(
      "/tasks/new?assignee=agt-1",
    );
    expect(taskEditHref("task-1")).toBe("/tasks/task-1");
  });

  it("treats create and edit paths as authoring routes", () => {
    expect(isTaskAuthoringRoute("/tasks")).toBe(false);
    expect(isTaskAuthoringRoute("/tasks/new")).toBe(true);
    expect(isTaskAuthoringRoute("/tasks/task-1")).toBe(true);
  });
});
