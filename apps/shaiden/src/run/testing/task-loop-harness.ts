import assert from "node:assert/strict";
import type { TaskLimits } from "@keidai/shared";
import { normalizeModelStep } from "../step-assessment.js";
import { runTaskLoop } from "../task-loop.js";
import type {
  ApprovalDecision,
  ModelStep,
  ModelToolCall,
  StepAssessment,
  TaskLoopDeps,
  ToolDispatchOptions,
  ToolDispatchResult,
} from "../types/task-loop.js";

export const limits: TaskLimits = {
  max_iterations: 5,
  timeout_seconds: 60,
};

export function runGoalLoop(
  goal: string,
  taskLimits: TaskLimits,
  deps: TaskLoopDeps,
) {
  return runTaskLoop(
    {
      initialHistory: [{ role: "user", text: goal }],
      limits: taskLimits,
    },
    deps,
  );
}

export { runTaskLoop };

export function toolCall(name: string, id = `${name}-1`): ModelToolCall {
  return { toolCallId: id, toolName: name, input: {} };
}

type ModelStepInput = Pick<ModelStep, "text" | "toolCalls"> & {
  assessment?: StepAssessment;
};

export function modelStep(step: ModelStepInput): ModelStep {
  return normalizeModelStep(step);
}

export function scriptedModel(
  steps: ModelStepInput[],
): () => Promise<ModelStep> {
  let index = 0;
  return async () => {
    const step = steps[index];
    assert.ok(step, "model called more times than scripted");
    index++;
    return normalizeModelStep(step);
  };
}

export const okDispatch = async (): Promise<ToolDispatchResult> => ({
  isError: false,
  text: "ok",
});

export function deferredApprovalDecision(): {
  waitForApproval: (approvalId: string) => Promise<ApprovalDecision>;
  whenPending: Promise<string>;
  resolve: (decision: ApprovalDecision) => void;
} {
  let resolveDecision!: (decision: ApprovalDecision) => void;
  let notifyPending!: (approvalId: string) => void;
  const whenPending = new Promise<string>((res) => {
    notifyPending = res;
  });

  const waitForApproval = (approvalId: string) =>
    new Promise<ApprovalDecision>((res) => {
      notifyPending(approvalId);
      resolveDecision = res;
    });

  return {
    waitForApproval,
    whenPending,
    resolve: (decision) => resolveDecision(decision),
  };
}

export function approvalRequiredDispatch(
  approvalId = "approval-1",
): (
  call: ModelToolCall,
  options?: ToolDispatchOptions,
) => Promise<ToolDispatchResult> {
  return async (_call, options) => {
    if (options?.approvalId) {
      return { isError: false, text: "approved result" };
    }
    return {
      isError: false,
      text: JSON.stringify({
        status: "approval_required",
        approval_id: approvalId,
      }),
      approvalRequired: { approvalId },
    };
  };
}
