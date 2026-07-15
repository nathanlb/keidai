import type { RunStep } from "@keidai/shared";
import { RUN_STATUS_META } from "./format-run-status.js";

export function formatRunStepTitle(step: RunStep): string {
  switch (step.kind) {
    case "model":
      return "Reasoning";
    case "tool_dispatch":
      return `Tool call · ${step.toolName ?? "unknown"}`;
    case "tool_result":
      return `Tool result · ${step.toolName ?? "unknown"}`;
    case "waiting_approval":
      return `Awaiting approval · ${step.toolName ?? "unknown"}`;
    case "user_message":
      return "Follow-up message";
    case "outcome":
      return `Outcome · ${RUN_STATUS_META[step.outcomeStatus].label}`;
  }
}

export function formatRunStepDescription(step: RunStep): string {
  switch (step.kind) {
    case "model":
      return step.text ?? "Model responded with tool calls";
    case "tool_dispatch":
      return step.inputPreview
        ? `Arguments: ${step.inputPreview}`
        : "Dispatching tool call through Torii";
    case "tool_result":
      if (step.status === "error") {
        return step.outputPreview ?? "Tool call failed";
      }
      if (step.outputPreview) {
        return step.outputPreview;
      }
      return step.charCount !== undefined
        ? `Returned ${step.charCount.toLocaleString()} chars`
        : "Tool call completed";
    case "waiting_approval":
      return step.inputPreview
        ? `Arguments: ${step.inputPreview}`
        : "Parked on a gated tool call";
    case "user_message":
      return step.text;
    case "outcome":
      return step.outcomeReason ?? RUN_STATUS_META[step.outcomeStatus].label;
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
