import { nextRunAt } from "@keidai/shared";
import {
  emptyTaskAuthoringValues,
  taskFromFormValues,
  type TaskAuthoringFormValues,
} from "../schemas/task-authoring-form-schema.js";

export type ScheduleNextFirePreview =
  | { status: "invalid" }
  | { status: "none" }
  | { status: "next"; iso: string };

export function previewScheduleNextFire(
  values: Pick<
    TaskAuthoringFormValues,
    "timezone" | "at" | "repeat" | "freq" | "days" | "paused"
  >,
  now = new Date(),
): ScheduleNextFirePreview {
  try {
    const task = taskFromFormValues({
      ...emptyTaskAuthoringValues(),
      goal: "preview",
      assignee: "preview",
      triggerType: "schedule",
      modelId: "",
      ...values,
    });
    const next = nextRunAt(task.trigger, now);
    if (!next) {
      return { status: "none" };
    }
    return { status: "next", iso: next.toISOString() };
  } catch {
    return { status: "invalid" };
  }
}
