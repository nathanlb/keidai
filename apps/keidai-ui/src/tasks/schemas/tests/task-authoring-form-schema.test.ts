import { describe, expect, it } from "vitest";
import {
  formValuesFromTask,
  taskFromFormValues,
} from "../task-authoring-form-schema.js";
import type { SavedTask } from "@keidai/shared";

describe("taskFromFormValues", () => {
  it("builds a now trigger", () => {
    expect(
      taskFromFormValues({
        goal: "Do the thing",
        assignee: "agt-1",
        triggerType: "now",
        timezone: "UTC",
        at: "2026-09-01T09:00",
        repeat: false,
        freq: "daily",
        days: ["mon"],
        paused: false,
      }).trigger,
    ).toEqual({ type: "now" });
  });

  it("builds a weekly schedule", () => {
    const task = taskFromFormValues({
      goal: "Do the thing",
      assignee: "agt-1",
      triggerType: "schedule",
      timezone: "America/New_York",
      at: "2026-09-07T09:00",
      repeat: true,
      freq: "weekly",
      days: ["mon"],
      paused: false,
    });
    expect(task.trigger).toEqual({
      type: "schedule",
      timezone: "America/New_York",
      at: "2026-09-07T09:00",
      recurrence: { freq: "weekly", days: ["mon"] },
    });
  });
});

describe("formValuesFromTask", () => {
  it("round-trips a paused daily task", () => {
    const saved: SavedTask = {
      id: "t1",
      goal: "Nightly",
      assignee: "agt-1",
      trigger: {
        type: "schedule",
        timezone: "UTC",
        at: "2026-01-01T00:00",
        recurrence: { freq: "daily" },
        paused: true,
      },
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const values = formValuesFromTask(saved);
    expect(values.triggerType).toBe("schedule");
    expect(values.repeat).toBe(true);
    expect(values.freq).toBe("daily");
    expect(values.paused).toBe(true);
    expect(taskFromFormValues(values).trigger).toEqual(saved.trigger);
  });
});
