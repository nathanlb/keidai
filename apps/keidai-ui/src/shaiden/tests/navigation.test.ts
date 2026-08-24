import { describe, expect, it } from "vitest";
import {
  NEW_TASK_HREF,
  NEW_TASK_PARAM,
  runDetailHref,
  RUNS_PATH,
  TASKS_PATH,
  taskEditHref,
} from "../navigation.js";

describe("shaiden path helpers", () => {
  it("uses the workspace routes", () => {
    expect(TASKS_PATH).toBe("/tasks");
    expect(RUNS_PATH).toBe("/runs");
    expect(taskEditHref("task-1")).toBe("/tasks/task-1");
    expect(runDetailHref("run-b")).toBe("/runs/run-b");
  });
});

describe("task authoring deep links", () => {
  it("opens the dialog over runs via query param", () => {
    expect(NEW_TASK_HREF).toBe(`/runs?${NEW_TASK_PARAM}=1`);
  });
});
