import assert from "node:assert/strict";
import type { TaskLimits } from "@keidai/shared";
import { normalizeModelStep } from "../step-assessment.js";
import { runTaskLoop } from "../task-loop.js";
import type {
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

export function deferredParkedResult(): {
  waitForApproval: (approvalId: string) => Promise<ToolDispatchResult>;
  whenPending: Promise<string>;
  resolve: (result: ToolDispatchResult) => void;
  reject: (error: Error) => void;
} {
  let resolveResult!: (result: ToolDispatchResult) => void;
  let rejectResult!: (error: Error) => void;
  let notifyPending!: (approvalId: string) => void;
  const whenPending = new Promise<string>((res) => {
    notifyPending = res;
  });

  const waitForApproval = (approvalId: string) =>
    new Promise<ToolDispatchResult>((res, rej) => {
      notifyPending(approvalId);
      resolveResult = res;
      rejectResult = rej;
    });

  return {
    waitForApproval,
    whenPending,
    resolve: (result) => resolveResult(result),
    reject: (error) => rejectResult(error),
  };
}

export function approvalRequiredDispatch(
  approvalId = "approval-1",
): (
  call: ModelToolCall,
  options?: ToolDispatchOptions,
) => Promise<ToolDispatchResult> {
  return async () => ({
    isError: false,
    text: "",
    approvalRequired: { approvalId },
  });
}
