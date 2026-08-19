import type { ToriiCallMeta } from "@keidai/shared";
import type { RunReporter } from "./run-reporter.js";
import { clipTaskOutput } from "./task-output.js";
import type { ModelToolCall } from "./types/task-loop.js";

export function previewOf(value: string, maxLength = 200): string {
  const flattened = value.replace(/\s+/g, " ").trim();
  return flattened.length > maxLength
    ? `${flattened.slice(0, maxLength)}…`
    : flattened;
}

export function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function recordToolDispatch(
  reporter: RunReporter,
  call: ModelToolCall,
): Promise<void> {
  await reporter.recordStep({
    kind: "tool_dispatch",
    toolName: call.toolName,
    toolCallId: call.toolCallId,
    inputPreview: previewOf(JSON.stringify(call.input)),
  });
}

export interface RecordableToolResult {
  isError: boolean;
  text: string;
  approvalRequired?: unknown;
  meta?: ToriiCallMeta;
}

export async function recordToolResult(
  reporter: RunReporter,
  call: ModelToolCall,
  result: RecordableToolResult,
): Promise<void> {
  await reporter.recordStep({
    kind: "tool_result",
    toolName: call.toolName,
    toolCallId: call.toolCallId,
    status: result.isError
      ? "error"
      : result.approvalRequired
        ? "approval_required"
        : "ok",
    charCount: result.text.length,
    outputPreview: previewOf(result.text, result.isError ? 500 : 200),
    ...(result.meta?.traceId ? { traceId: result.meta.traceId } : {}),
  });
}

export async function recordTaskOutput(reporter: RunReporter, text: string): Promise<void> {
  await reporter.recordStep({
    kind: "output",
    text: clipTaskOutput(text),
  });
}
