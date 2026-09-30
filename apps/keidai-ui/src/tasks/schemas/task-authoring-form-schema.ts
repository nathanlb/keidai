import { z } from "zod";
import {
  DEFAULT_TASK_LIMITS,
  WEEKDAYS,
  type UpdateTaskRequest,
  isIanaTimeZone,
  isScheduleTrigger,
  isValidLocalDateTime,
  taskSchema,
  type SavedTask,
  type Task,
  type Weekday,
} from "@keidai/shared";

export const taskAuthoringFormSchema = z
  .object({
    goal: z.string().min(1, "Goal is required"),
    assignee: z.string().min(1, "Assignee is required"),
    triggerType: z.enum(["now", "schedule"]),
    timezone: z.string().min(1),
    at: z.string().min(1),
    repeat: z.boolean(),
    freq: z.enum(["daily", "weekly", "monthly"]),
    days: z.array(z.enum(WEEKDAYS)),
    paused: z.boolean(),
    modelId: z.string(),
  })
  .superRefine((values, ctx) => {
    if (values.triggerType !== "schedule") {
      return;
    }
    if (!isIanaTimeZone(values.timezone)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["timezone"],
        message: "Invalid timezone",
      });
    }
    if (!isValidLocalDateTime(values.at)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["at"],
        message: "Invalid date and time",
      });
    }
    if (values.repeat && values.freq === "weekly" && values.days.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["days"],
        message: "Pick at least one weekday",
      });
    }
  });

export type TaskAuthoringFormValues = z.infer<typeof taskAuthoringFormSchema>;

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

export function defaultTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export function defaultLocalAt(now = new Date()): string {
  const next = new Date(now.getTime());
  next.setSeconds(0, 0);
  next.setHours(next.getHours() + 1);
  next.setMinutes(0);
  return `${next.getFullYear()}-${pad2(next.getMonth() + 1)}-${pad2(next.getDate())}T${pad2(next.getHours())}:${pad2(next.getMinutes())}`;
}

export function emptyTaskAuthoringValues(): TaskAuthoringFormValues {
  return {
    goal: "",
    assignee: "",
    triggerType: "now",
    timezone: defaultTimeZone(),
    at: defaultLocalAt(),
    repeat: false,
    freq: "daily",
    days: ["mon"],
    paused: false,
    modelId: "",
  };
}

export function formValuesFromTask(task: SavedTask): TaskAuthoringFormValues {
  const base = emptyTaskAuthoringValues();
  if (!isScheduleTrigger(task.trigger)) {
    return {
      ...base,
      goal: task.goal,
      assignee: task.assignee,
      triggerType: "now",
      modelId: task.modelId ?? "",
    };
  }
  const recurrence = task.trigger.recurrence;
  const days: Weekday[] =
    recurrence?.freq === "weekly" ? [...recurrence.days] : ["mon"];
  return {
    ...base,
    goal: task.goal,
    assignee: task.assignee,
    triggerType: "schedule",
    timezone: task.trigger.timezone,
    at: task.trigger.at,
    repeat: Boolean(recurrence),
    freq: recurrence?.freq ?? "daily",
    days,
    paused: Boolean(task.trigger.paused),
    modelId: task.modelId ?? "",
  };
}

function withModelId(values: TaskAuthoringFormValues, task: Task): Task {
  const modelId = values.modelId.trim();
  return modelId ? { ...task, modelId } : task;
}

export function taskFromFormValues(values: TaskAuthoringFormValues): Task {
  if (values.triggerType === "now") {
    return withModelId(
      values,
      taskSchema.parse({
        goal: values.goal.trim(),
        trigger: { type: "now" },
        assignee: values.assignee,
        limits: DEFAULT_TASK_LIMITS,
      }),
    );
  }

  const recurrence = values.repeat
    ? values.freq === "weekly"
      ? { freq: "weekly" as const, days: values.days }
      : { freq: values.freq }
    : undefined;

  return withModelId(
    values,
    taskSchema.parse({
      goal: values.goal.trim(),
      trigger: {
        type: "schedule",
        timezone: values.timezone,
        at: values.at,
        ...(recurrence ? { recurrence } : {}),
        ...(values.paused ? { paused: true } : {}),
      },
      assignee: values.assignee,
      limits: DEFAULT_TASK_LIMITS,
    }),
  );
}

/** Edit payload. An empty model clears a previously saved override. */
export function taskUpdateFromFormValues(
  values: TaskAuthoringFormValues,
): UpdateTaskRequest {
  return {
    ...taskFromFormValues(values),
    modelId: values.modelId.trim() || null,
  };
}
