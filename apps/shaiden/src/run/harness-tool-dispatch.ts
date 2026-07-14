import { randomUUID } from "node:crypto";
import {
  TORII_APPROVAL_ID_ARG,
  TORII_RUN_ID_ARG,
  TORII_STEP_ID_ARG,
  type Logger,
} from "@keidai/shared";
import type { RunReporter } from "./run-reporter.js";
import {
  describeError,
  previewOf,
  recordToolDispatch,
  recordToolResult,
} from "./run-step-recording.js";
import type {
  ModelToolCall,
  ToolDispatchOptions,
  ToolDispatchResult,
} from "./types/task-loop.js";

export interface HarnessToolDispatcherDeps {
  runId: string;
  reporter: RunReporter;
  availableToolNames: ReadonlySet<string>;
  callTool: (
    toolName: string,
    args: Record<string, unknown>,
  ) => Promise<ToolDispatchResult>;
  logger?: Logger;
}

export function createHarnessToolDispatcher({
  runId,
  reporter,
  availableToolNames,
  callTool,
  logger,
}: HarnessToolDispatcherDeps) {
  return async (call: ModelToolCall, options?: ToolDispatchOptions) => {
    const correlationStepId = options?.stepId ?? randomUUID();

    if (!availableToolNames.has(call.toolName)) {
      const errorMessage = "tool is not available from Torii";
      recordToolDispatch(reporter, call);
      recordToolResult(reporter, call, {
        isError: true,
        text: errorMessage,
      });
      return { isError: true, text: errorMessage };
    }

    const args = {
      ...call.input,
      [TORII_RUN_ID_ARG]: options?.runId ?? runId,
      [TORII_STEP_ID_ARG]: correlationStepId,
      ...(options?.approvalId
        ? { [TORII_APPROVAL_ID_ARG]: options.approvalId }
        : {}),
    };

    logger?.info("run.tool_dispatch", {
      runId,
      toolName: call.toolName,
      inputPreview: previewOf(JSON.stringify(call.input)),
    });
    recordToolDispatch(reporter, call);

    let result: ToolDispatchResult;
    try {
      result = await callTool(call.toolName, args);
    } catch (error) {
      const errorMessage = describeError(error);
      logger?.info("run.tool_result", {
        runId,
        toolName: call.toolName,
        status: "error",
        error: errorMessage,
      });
      const errorResult = { isError: true as const, text: errorMessage };
      recordToolResult(reporter, call, errorResult);
      return errorResult;
    }

    logger?.info("run.tool_result", {
      runId,
      toolName: call.toolName,
      status: result.isError
        ? "error"
        : result.approvalRequired
          ? "approval_required"
          : "ok",
      charCount: result.text.length,
    });
    recordToolResult(reporter, call, result);

    if (result.approvalRequired) {
      return {
        ...result,
        approvalRequired: {
          approvalId: result.approvalRequired.approvalId,
          stepId: correlationStepId,
        },
      };
    }

    return result;
  };
}
