import { createHash } from "node:crypto";
import { resolveTaskLimits, type Task } from "@keidai/shared";

/**
 * Identity of the task definition that produced an attempt: goal, effective
 * limits, and model override. Omitted limits hash as the defaults. Explicit
 * null limits ("no limit") hash as null, so they do not collide with defaults.
 */
export function taskRevisionHash(task: Task): string {
  const limits = resolveTaskLimits(task);
  const payload = JSON.stringify({
    goal: task.goal,
    max_iterations: limits.max_iterations,
    timeout_seconds: limits.timeout_seconds,
    modelId: task.modelId ?? null,
  });
  return createHash("sha256").update(payload).digest("hex");
}
