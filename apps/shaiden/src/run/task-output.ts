import { z } from "zod";

/**
 * Max stored length for an in-band task deliverable. Higher than model-step
 * reasoning previews (500) so operators can read summaries/checklists in-band.
 */
export const TASK_OUTPUT_MAX_LENGTH = 10_000;

/** Harness-local tool the model calls to emit an in-band deliverable. */
export const REPORT_TASK_OUTPUT_TOOL = "report_task_output";

/**
 * Model-facing how/when guidance for the deliverable tool. Kept next to the
 * tool name so the runtime protocol does not restate a hard-coded name.
 */
export const REPORT_TASK_OUTPUT_DESCRIPTION =
  "Record an in-band task deliverable for the operator in the run log (summary, short answer, checklist, link plus explanation). Call this when the work product is text they should read here — not for intermediate reasoning, and not as a substitute for the terminal assessment tool. Free-form narration does not create a deliverable. Skip this tool when the deliverable lives only in an external system via Torii tools (Notion page, ticket, doc, etc.); the tool trail is enough. May be called more than once (e.g. interim findings, then a final answer), including in the same turn as the terminal assessment tool.";

export const taskOutputSchema = z.object({
  text: z
    .string()
    .min(1)
    .max(TASK_OUTPUT_MAX_LENGTH)
    .describe(
      "In-band task deliverable for the operator (summary, answer, checklist, link plus explanation). Not an outcome explanation.",
    ),
});

export type TaskOutput = z.infer<typeof taskOutputSchema>;

export function parseTaskOutput(value: unknown): TaskOutput | undefined {
  const parsed = taskOutputSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

/** Preserve newlines; only trim edges and clip overlong text. */
export function clipTaskOutput(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length <= TASK_OUTPUT_MAX_LENGTH) {
    return trimmed;
  }
  return `${trimmed.slice(0, TASK_OUTPUT_MAX_LENGTH)}…`;
}

export function isHarnessLocalTool(toolName: string): boolean {
  return toolName === REPORT_TASK_OUTPUT_TOOL;
}
