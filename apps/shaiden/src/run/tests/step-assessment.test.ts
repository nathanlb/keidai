import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  mapTerminalAssessmentToOutcome,
  parseStepAssessment,
  resolveModelStepAssessment,
  stepAssessmentSchema,
} from "../step-assessment.js";

describe("step assessment", () => {
  it("validates terminal assessment schema", () => {
    const parsed = stepAssessmentSchema.parse({
      status: "goal_met",
      message: "Draft created.",
    });

    assert.deepEqual(parsed, {
      status: "goal_met",
      message: "Draft created.",
    });
  });

  it("rejects continue as a terminal assessment status", () => {
    assert.equal(
      parseStepAssessment({
        status: "continue",
        message: "still working",
      }),
      undefined,
    );
  });

  it("rejects human_reject as a model assessment status", () => {
    assert.equal(
      parseStepAssessment({
        status: "human_reject",
        message: "Denied by reviewer.",
      }),
      undefined,
    );
  });

  it("maps goal_met assessment to goal_met outcome", () => {
    assert.deepEqual(
      mapTerminalAssessmentToOutcome({
        status: "goal_met",
        message: "Done.",
      }),
      { status: "goal_met" },
    );
  });

  it("maps cannot_complete assessment to failed with message reason", () => {
    assert.deepEqual(
      mapTerminalAssessmentToOutcome({
        status: "cannot_complete",
        message: "Missing Gmail permission.",
      }),
      { status: "failed", reason: "Missing Gmail permission." },
    );
  });

  it("maps empty cannot_complete message to a default reason", () => {
    assert.deepEqual(
      mapTerminalAssessmentToOutcome({
        status: "cannot_complete",
        message: "   ",
      }),
      { status: "failed", reason: "agent reported cannot complete" },
    );
  });

  it("maps missing assessment to failed", () => {
    assert.deepEqual(mapTerminalAssessmentToOutcome(undefined), {
      status: "failed",
      reason: "model returned no step assessment",
    });
  });

  it("defaults terminal text-only steps to cannot_complete when assessment is missing", () => {
    assert.deepEqual(
      resolveModelStepAssessment(undefined, [], "Done: draft created."),
      { status: "cannot_complete", message: "Done: draft created." },
    );
  });

  it("omits assessment when Torii tools are present", () => {
    assert.equal(
      resolveModelStepAssessment(
        { status: "goal_met", message: "ignore me" },
        [{ toolCallId: "1", toolName: "x", input: {} }],
        "",
      ),
      undefined,
    );
  });

  it("parses assessment from report_step_assessment tool input", () => {
    assert.deepEqual(
      parseStepAssessment({
        status: "cannot_complete",
        message: "No permission.",
      }),
      { status: "cannot_complete", message: "No permission." },
    );
  });
});
