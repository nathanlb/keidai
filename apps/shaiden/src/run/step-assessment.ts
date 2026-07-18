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
    .describe("Human-readable final explanation for this outcome"),
});

export type StepAssessmentStatus = z.infer<typeof stepAssessmentStatusSchema>;
export type StepAssessment = z.infer<typeof stepAssessmentSchema>;

/** Harness-local tool the model calls to report a terminal step assessment. */
export const REPORT_STEP_ASSESSMENT_TOOL = "report_step_assessment";

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
 * Torii tool calls imply continue — assessment is ignored/omitted.
 * Text-only with no assessment falls back to goal_met when message is present.
 */
export function resolveModelStepAssessment(
  assessment: StepAssessment | undefined,
  toolCalls: ModelStep["toolCalls"],
  fallbackText: string,
): StepAssessment | undefined {
  if (toolCalls.length > 0) {
    return undefined;
  }

  if (assessment) {
    return assessment;
  }

  const message = fallbackText.trim();
  if (message.length > 0) {
    return { status: "goal_met", message };
  }

  return undefined;
}
