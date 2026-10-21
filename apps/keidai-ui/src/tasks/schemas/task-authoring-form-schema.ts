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
  type TaskLimits,
  type Weekday,
} from "@keidai/shared";

export const MIN_TASK_ITERATIONS = 1;
export const MAX_TASK_ITERATIONS = 100_000;
export const MIN_TASK_TIMEOUT_MINUTES = 1;
/** Seven days. Longer runs should turn limits off. */
export const MAX_TASK_TIMEOUT_MINUTES = 7 * 24 * 60;

const WHOLE_NUMBER = /^\d+$/;

function defaultTimeoutMinutes(): string {
  return String(DEFAULT_TASK_LIMITS.timeout_seconds / 60);
}

function addLimitIssue(
  ctx: z.RefinementCtx,
  path: "maxIterations" | "timeoutMinutes",
  raw: string,
  message: string,
  min: number,
  max: number,
) {
  const trimmed = raw.trim();
  const value = WHOLE_NUMBER.test(trimmed) ? Number(trimmed) : Number.NaN;
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: [path],
      message,
    });
  }
}

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
    unlimited: z.boolean(),
    maxIterations: z.string(),
    timeoutMinutes: z.string(),
  })
  .superRefine((values, ctx) => {
    if (!values.unlimited) {
      addLimitIssue(
        ctx,
        "maxIterations",
        values.maxIterations,
        `Enter a whole number from ${MIN_TASK_ITERATIONS} to ${MAX_TASK_ITERATIONS}, or turn on no limits`,
        MIN_TASK_ITERATIONS,
        MAX_TASK_ITERATIONS,
      );
      addLimitIssue(
        ctx,
        "timeoutMinutes",
        values.timeoutMinutes,
        `Enter a whole number of minutes from ${MIN_TASK_TIMEOUT_MINUTES} to ${MAX_TASK_TIMEOUT_MINUTES}, or turn on no limits`,
        MIN_TASK_TIMEOUT_MINUTES,
        MAX_TASK_TIMEOUT_MINUTES,
      );
    }
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
    unlimited: false,
    maxIterations: String(DEFAULT_TASK_LIMITS.max_iterations),
    timeoutMinutes: defaultTimeoutMinutes(),
  };
}

function limitFieldsFromTask(
  task: SavedTask,
): Pick<
  TaskAuthoringFormValues,
  "unlimited" | "maxIterations" | "timeoutMinutes"
> {
  const limits = task.limits;
  const unlimited =
    limits != null &&
    limits.max_iterations == null &&
    limits.timeout_seconds == null;
  const iterations =
    limits?.max_iterations ?? DEFAULT_TASK_LIMITS.max_iterations;
  const timeoutSeconds =
    limits?.timeout_seconds ?? DEFAULT_TASK_LIMITS.timeout_seconds;
  return {
    unlimited,
    maxIterations: String(iterations),
    timeoutMinutes: String(Math.max(1, Math.round(timeoutSeconds / 60))),
  };
}

export function formValuesFromTask(task: SavedTask): TaskAuthoringFormValues {
  const base = {
    ...emptyTaskAuthoringValues(),
    ...limitFieldsFromTask(task),
  };
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

export function limitsFromFormValues(
  values: Pick<
    TaskAuthoringFormValues,
    "unlimited" | "maxIterations" | "timeoutMinutes"
  >,
): TaskLimits {
  if (values.unlimited) {
    return { max_iterations: null, timeout_seconds: null };
  }
  return {
    max_iterations: Number(values.maxIterations.trim()),
    timeout_seconds: Number(values.timeoutMinutes.trim()) * 60,
  };
}

export function taskFromFormValues(values: TaskAuthoringFormValues): Task {
  const limits = limitsFromFormValues(values);
  if (values.triggerType === "now") {
    return withModelId(
      values,
      taskSchema.parse({
        goal: values.goal.trim(),
        trigger: { type: "now" },
        assignee: values.assignee,
        limits,
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
      limits,
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
