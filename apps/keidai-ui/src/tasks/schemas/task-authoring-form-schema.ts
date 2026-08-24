import { z } from "zod";

/** Fields the task authoring UI edits. Trigger/limits are fixed in v0. */
export const taskAuthoringFormSchema = z.object({
  goal: z.string().min(1, "Goal is required"),
  assignee: z.string().min(1, "Assignee is required"),
});

export type TaskAuthoringFormValues = z.infer<typeof taskAuthoringFormSchema>;
