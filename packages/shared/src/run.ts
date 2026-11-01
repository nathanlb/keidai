import { z } from "zod";
import { taskSchema, type Task } from "./task.js";

/**
 * Why a non-success outcome happened. Absent on outcomes written before the
 * class existed, and on `goal_met` / `stopped`, which are not failures.
 */
export const failureClassSchema = z.enum([
  "platform",
  "agent",
  "limit",
  "human",
]);

export type FailureClass = z.infer<typeof failureClassSchema>;

const failureClassField = {
  failureClass: failureClassSchema.optional(),
};

export const terminationOutcomeSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("goal_met"), ...failureClassField }),
  z.object({
    status: z.literal("iteration_exhausted"),
    ...failureClassField,
  }),
  z.object({ status: z.literal("timeout"), ...failureClassField }),
  z.object({ status: z.literal("human_reject"), ...failureClassField }),
  z.object({ status: z.literal("stopped"), ...failureClassField }),
  z.object({
    status: z.literal("failed"),
    reason: z.string().min(1),
    ...failureClassField,
  }),
]);

export type TerminationOutcome = z.infer<typeof terminationOutcomeSchema>;

export interface Run {
  id: string;
  task: Task;
  startedAt: string;
  outcome: TerminationOutcome;
}

export const runSchema = z.object({
  id: z.string().min(1),
  task: taskSchema,
  startedAt: z.string().datetime(),
  outcome: terminationOutcomeSchema,
});
