import { z } from "zod";

/** v0 trigger union — only `now` is implemented. */
export const taskTriggerSchema = z.object({
  type: z.literal("now"),
});

export type TaskTrigger = z.infer<typeof taskTriggerSchema>;

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
