import { z } from "zod";
import { taskSchema, type Task } from "./task.js";

export const terminationOutcomeSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("goal_met") }),
  z.object({ status: z.literal("iteration_exhausted") }),
  z.object({ status: z.literal("timeout") }),
  z.object({ status: z.literal("human_reject") }),
  z.object({
    status: z.literal("failed"),
    reason: z.string().min(1),
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
