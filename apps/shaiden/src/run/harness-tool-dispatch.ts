import { randomUUID } from "node:crypto";
import {
  TORII_RUN_ID_ARG,
  TORII_STEP_ID_ARG,
  type Logger,
} from "@keidai/shared";
import { PolicyDeniedError } from "../mcp/types/policy-denied-error.js";
import { TaskCancelledError } from "../mcp/types/task-cancelled-error.js";
import type { RunReporter } from "./run-reporter.js";
import {
  describeError,
  previewOf,
  recordTaskOutput,
  recordToolDispatch,
  recordToolResult,
} from "./run-step-recording.js";
import {
  parseTaskOutput,
  REPORT_TASK_OUTPUT_TOOL,
} from "./task-output.js";
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

    if (call.toolName === REPORT_TASK_OUTPUT_TOOL) {
      const parsed = parseTaskOutput(call.input);
      if (!parsed) {
        const errorMessage = "invalid report_task_output input";
        logger?.info("run.task_output", {
          runId,
          status: "error",
          error: errorMessage,
        });
        return { isError: true, text: errorMessage };
      }

      recordTaskOutput(reporter, parsed.text);
      logger?.info("run.task_output", {
        runId,
        status: "ok",
        charCount: parsed.text.length,
      });
      return {
        isError: false,
        text: "Output recorded for the operator.",
      };
    }

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
      if (error instanceof TaskCancelledError) {
        throw error;
      }
      const errorMessage = describeError(error);
      const policyDenied = error instanceof PolicyDeniedError;
      logger?.info("run.tool_result", {
        runId,
        toolName: call.toolName,
        status: "error",
        error: errorMessage,
        ...(policyDenied ? { policyDenied: true } : {}),
      });
      const errorResult = {
        isError: true as const,
        text: errorMessage,
        ...(policyDenied ? { policyDenied: true as const } : {}),
      };
      recordToolResult(reporter, call, errorResult);
      return errorResult;
    }

    if (result.isError && result.policyDenied !== true) {
      if (/(^|\b)policy_denied\b/i.test(result.text)) {
        result = { ...result, policyDenied: true };
      }
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
          pollIntervalMs: result.approvalRequired.pollIntervalMs,
        },
      };
    }

    return result;
  };
}
