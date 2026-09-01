import { describe, expect, it } from "vitest";
import {
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
