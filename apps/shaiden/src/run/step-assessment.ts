import type { TerminationOutcome } from "@keidai/shared";
import { z } from "zod";
import type { ModelStep } from "./types/task-loop.js";

/** Terminal statuses the model may report. Human denials are harness-driven. */
export const stepAssessmentStatusSchema = z.enum([
  "goal_met",
  "cannot_complete",
]);

export const stepAssessmentSchema = z.object({
  status: stepAssessmentStatusSchema.describe(
    "Terminal self-assessment. Call only when finishing; do not call while using other tools.",
  ),
  message: z
    .string()
    .describe(
      "Human-readable outcome explanation (why the run ended / what failed). Not the in-band deliverable body.",
    ),
});

export type StepAssessmentStatus = z.infer<typeof stepAssessmentStatusSchema>;
export type StepAssessment = z.infer<typeof stepAssessmentSchema>;

/** Harness-local tool the model calls to report a terminal step assessment. */
export const REPORT_STEP_ASSESSMENT_TOOL = "report_step_assessment";

/** Model-facing how/when guidance for the terminal assessment tool. */
export const REPORT_STEP_ASSESSMENT_DESCRIPTION =
  "Report a terminal outcome when the task is finished. Call alone (no Torii tools) with status goal_met or cannot_complete. message is the human-readable outcome explanation (why the run ended / what failed) — not the deliverable body; put in-band deliverable text on the dedicated deliverable tool instead (they may share a turn). A plain text summary is not a substitute for this call.";

const MISSING_TERMINAL_ASSESSMENT =
  "model returned no step assessment" as const;

export function mapTerminalAssessmentToOutcome(
  assessment: StepAssessment | undefined,
): TerminationOutcome {
  if (!assessment) {
    return { status: "failed", reason: MISSING_TERMINAL_ASSESSMENT };
  }

  switch (assessment.status) {
    case "goal_met":
      return { status: "goal_met" };
    case "cannot_complete": {
      const reason = assessment.message.trim();
      return {
        status: "failed",
        reason: reason.length > 0 ? reason : "agent reported cannot complete",
      };
    }
  }
}

/**
 * Default assessment for scripted tests: Torii tools imply continue (no
 * assessment); text-only steps default to goal_met.
 */
export function normalizeModelStep(
  step: Pick<ModelStep, "text" | "toolCalls"> & { assessment?: StepAssessment },
): ModelStep {
  if (step.toolCalls.length > 0) {
    return {
      text: step.text,
      toolCalls: step.toolCalls,
    };
  }

  const assessment =
    step.assessment ??
    ({ status: "goal_met", message: step.text } satisfies StepAssessment);

  return {
    text: assessment.message || step.text,
    toolCalls: [],
    assessment,
  };
}

export function parseStepAssessment(
  value: unknown,
): StepAssessment | undefined {
  const parsed = stepAssessmentSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

/**
 * Resolve assessment from an optional terminal report tool call.
 * - Torii tool calls imply continue — assessment is ignored/omitted.
 * - Explicit assessment may share a turn with non-Torii harness tools (e.g. output).
 * - Harness tools without an explicit assessment imply continue — do not treat
 *   accompanying narration as cannot_complete.
 * - Text-only with no assessment falls back to cannot_complete when message is present.
 */
export function resolveModelStepAssessment(
  assessment: StepAssessment | undefined,
  toriiToolCalls: ModelStep["toolCalls"],
  fallbackText: string,
  continuingToolCalls: ModelStep["toolCalls"] = [],
): StepAssessment | undefined {
  if (toriiToolCalls.length > 0) {
    return undefined;
  }

  if (assessment) {
    return assessment;
  }

  if (continuingToolCalls.length > 0) {
    return undefined;
  }

  const message = fallbackText.trim();
  if (message.length > 0) {
    return { status: "cannot_complete", message };
  }

  return undefined;
}
