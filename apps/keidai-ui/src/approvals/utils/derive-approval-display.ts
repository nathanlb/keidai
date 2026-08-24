import type { ApprovalRecordView, RunReport } from "@keidai/shared";
import { parseNamespacedToolName } from "./parse-namespaced-tool-name.js";

export interface ApprovalDisplayContext {
  taskName?: string;
  reasoning?: string;
  iterationCurrent?: number;
}

export function deriveApprovalDisplay(
  approval: ApprovalRecordView,
  run?: RunReport,
): ApprovalDisplayContext & {
  server: string;
  tool: string;
  connectionLabel: string;
} {
  const { server, tool } = parseNamespacedToolName(approval.toolName);
  const context: ApprovalDisplayContext = {};

  if (run) {
    context.taskName = run.goalPreview;
    context.iterationCurrent = run.steps.filter((step) => step.kind === "model").length;

    const waitingIndex = run.steps.findIndex(
      (step) =>
        step.kind === "waiting_approval" && step.approvalId === approval.id,
    );
    if (waitingIndex > 0) {
      for (let index = waitingIndex - 1; index >= 0; index -= 1) {
        const step = run.steps[index];
        if (step?.kind === "model" && step.text) {
          context.reasoning = step.text;
          break;
        }
      }
    }
  }

  return {
    ...context,
    server,
    tool,
    connectionLabel: server,
  };
}
