import type { RunStep } from "@keidai/shared";

export function formatRunStepTitle(step: RunStep): string {
  switch (step.kind) {
    case "model":
      return "Reasoning";
    case "tool_dispatch":
      return step.toolName ?? "Tool dispatch";
    case "tool_result":
      return step.toolName ?? "Tool result";
    case "waiting_approval":
      return step.toolName ?? "Awaiting approval";
  }
}

export function formatRunStepDescription(step: RunStep): string {
  switch (step.kind) {
    case "model":
      return step.text ?? "Model responded with tool calls";
    case "tool_dispatch":
      return step.inputPreview ?? "Dispatching tool call through Torii";
    case "tool_result":
      if (step.status === "error") {
        return "Tool call failed";
      }
      return step.charCount !== undefined
        ? `Returned ${step.charCount.toLocaleString()} chars`
        : "Tool call completed";
    case "waiting_approval":
      return step.inputPreview ?? "Parked on a gated tool call";
  }
}

export function formatRunStepMeta(step: RunStep): string | undefined {
  switch (step.kind) {
    case "tool_result":
      if (!step.status) {
        return undefined;
      }
      return step.status;
    default:
      return undefined;
  }
}
