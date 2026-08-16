import {
  APPROVAL_DENIED_STATUS,
  MCP_COMPLETE_RESULT_TYPE,
  TORII_CALL_META_KEY,
  mcpGetTaskResultSchema,
  type ApprovalDeniedPayload,
  type McpGetTaskResult,
  type ToriiCallMeta,
} from "@keidai/shared";
import { TaskCancelledError } from "./types/task-cancelled-error.js";
import type { ToolCallResult } from "./types/index.js";

function tryParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function isApprovalDeniedPayload(
  value: unknown,
): value is ApprovalDeniedPayload {
  return (
    typeof value === "object" &&
    value !== null &&
    "status" in value &&
    value.status === APPROVAL_DENIED_STATUS
  );
}

export function enrichToolCallResult(
  isError: boolean,
  text: string,
): ToolCallResult {
  const parsed = tryParseJson(text);
  if (isApprovalDeniedPayload(parsed)) {
    return {
      isError: false,
      text: formatApprovalDeniedForModel(parsed),
      approvalDenied: true,
    };
  }

  return { isError, text };
}

export function formatApprovalDeniedForModel(
  payload: ApprovalDeniedPayload,
): string {
  if (payload.reason) {
    return `Human review denied this tool call. Reason: ${payload.reason}. This denial is authoritative — do not retry this call or attempt the same action through a different tool.`;
  }

  return "Human review denied this tool call. This denial is authoritative — do not retry this call or attempt the same action through a different tool.";
}

function flattenToolContent(content: unknown): string {
  if (!Array.isArray(content)) {
    return "";
  }
  return content
    .map((part) =>
      part &&
      typeof part === "object" &&
      "type" in part &&
      part.type === "text" &&
      "text" in part
        ? String(part.text)
        : JSON.stringify(part),
    )
    .join("\n");
}

function extractToriiCallMeta(meta: unknown): ToriiCallMeta | undefined {
  if (!meta || typeof meta !== "object") {
    return undefined;
  }
  const toriiMeta = (meta as Record<string, unknown>)[TORII_CALL_META_KEY];
  if (!toriiMeta || typeof toriiMeta !== "object") {
    return undefined;
  }
  const traceId = (toriiMeta as Record<string, unknown>).traceId;
  return typeof traceId === "string" ? { traceId } : undefined;
}

export function mapCallToolResponse(response: {
  isError?: boolean;
  content?: unknown;
  _meta?: unknown;
}): ToolCallResult {
  const result = enrichToolCallResult(
    response.isError === true,
    flattenToolContent(response.content),
  );
  const meta = extractToriiCallMeta(response._meta);
  const withMeta = meta ? { ...result, meta } : result;
  if (withMeta.isError && /(^|\b)policy_denied\b/i.test(withMeta.text)) {
    return { ...withMeta, policyDenied: true };
  }
  return withMeta;
}

/**
 * Map a tools/call payload that is already terminal. Create-task results are
 * the flat Task shape, so a completed call only maps when `result` is present;
 * otherwise the caller should poll `tasks/get`.
 */
export function tryMapTerminalCreateTaskResult(
  response: Record<string, unknown>,
): ToolCallResult | undefined {
  const parsed = mcpGetTaskResultSchema.safeParse({
    ...response,
    resultType: MCP_COMPLETE_RESULT_TYPE,
  });
  if (!parsed.success) {
    return undefined;
  }
  return mapTerminalMcpTaskToToolCallResult(parsed.data);
}

export function mapTerminalMcpTaskToToolCallResult(
  task: McpGetTaskResult,
): ToolCallResult {
  if (task.status === "cancelled") {
    throw new TaskCancelledError();
  }
  if (task.status === "failed") {
    const message =
      typeof task.error.message === "string" && task.error.message.length > 0
        ? task.error.message
        : "MCP task failed";
    return { isError: true, text: message };
  }
  if (task.status !== "completed") {
    throw new Error(`MCP task is not terminal: ${task.status}`);
  }
  return mapCallToolResponse(task.result);
}
