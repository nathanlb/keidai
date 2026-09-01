import { z } from "zod";

export const WEEKDAYS = [
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
  "sun",
] as const;

export type Weekday = (typeof WEEKDAYS)[number];

const LOCAL_DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

export function isIanaTimeZone(value: string): boolean {
  try {
    Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export function isValidLocalDateTime(value: string): boolean {
  const match = LOCAL_DATE_TIME.exec(value);
  if (!match) {
    return false;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  if (hour > 23 || minute > 59 || month < 1 || month > 12 || day < 1) {
    return false;
  }
  const date = new Date(Date.UTC(year, month - 1, day, hour, minute));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() + 1 === month &&
    date.getUTCDate() === day &&
    date.getUTCHours() === hour &&
    date.getUTCMinutes() === minute
  );
}

const ianaTimeZoneSchema = z
  .string()
  .min(1)
  .refine(isIanaTimeZone, "invalid IANA timezone");

const localDateTimeSchema = z
  .string()
  .regex(LOCAL_DATE_TIME, "expected YYYY-MM-DDTHH:mm")
  .refine(isValidLocalDateTime, "invalid calendar datetime");

const weekdaySchema = z.enum(WEEKDAYS);

export const scheduleRecurrenceSchema = z.discriminatedUnion("freq", [
  z.object({ freq: z.literal("daily") }),
  z.object({
    freq: z.literal("weekly"),
    days: z
      .array(weekdaySchema)
      .min(1)
      .refine(
        (days) => new Set(days).size === days.length,
        "duplicate weekdays",
      ),
  }),
  z.object({ freq: z.literal("monthly") }),
]);

export type ScheduleRecurrence = z.infer<typeof scheduleRecurrenceSchema>;

export const nowTriggerSchema = z.object({
  type: z.literal("now"),
});

export const scheduleTriggerSchema = z.object({
  type: z.literal("schedule"),
  timezone: ianaTimeZoneSchema,
  at: localDateTimeSchema,
  recurrence: scheduleRecurrenceSchema.optional(),
  paused: z.boolean().optional(),
});

export const taskTriggerSchema = z.discriminatedUnion("type", [
  nowTriggerSchema,
  scheduleTriggerSchema,
]);

export type NowTrigger = z.infer<typeof nowTriggerSchema>;
export type ScheduleTrigger = z.infer<typeof scheduleTriggerSchema>;
export type TaskTrigger = z.infer<typeof taskTriggerSchema>;

export function isScheduleTrigger(
  trigger: TaskTrigger,
): trigger is ScheduleTrigger {
  return trigger.type === "schedule";
}

function recurrenceEqual(
  left: ScheduleRecurrence | undefined,
  right: ScheduleRecurrence | undefined,
): boolean {
  if (left === undefined && right === undefined) {
    return true;
  }
  if (left === undefined || right === undefined) {
    return false;
  }
  if (left.freq !== right.freq) {
    return false;
  }
  if (left.freq === "weekly" && right.freq === "weekly") {
    if (left.days.length !== right.days.length) {
      return false;
    }
    const rightDays = new Set(right.days);
    return left.days.every((day) => rightDays.has(day));
  }
  return true;
}

/** True when two triggers describe the same fire rules (weekday order ignored). */
export function taskTriggersEqual(
  left: TaskTrigger,
  right: TaskTrigger,
): boolean {
  if (left.type !== right.type) {
    return false;
  }
  if (left.type === "now" || right.type === "now") {
    return true;
  }
  return (
    left.timezone === right.timezone &&
    left.at === right.at &&
    Boolean(left.paused) === Boolean(right.paused) &&
    recurrenceEqual(left.recurrence, right.recurrence)
  );
}

export const taskLimitsSchema = z.object({
  max_iterations: z.number().int().positive(),
  timeout_seconds: z.number().int().positive(),
});

export type TaskLimits = z.infer<typeof taskLimitsSchema>;

export const DEFAULT_TASK_LIMITS: TaskLimits = {
  max_iterations: 25,
  timeout_seconds: 600,
};

export const taskSchema = z.object({
  goal: z.string().min(1),
  trigger: taskTriggerSchema,
  assignee: z.string().min(1),
  limits: taskLimitsSchema.optional(),
});

export type Task = z.infer<typeof taskSchema>;

export function resolveTaskLimits(task: Task): TaskLimits {
  return task.limits ?? DEFAULT_TASK_LIMITS;
}
