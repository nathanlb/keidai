import { randomUUID } from "node:crypto";
import {
  TORII_APPROVAL_ID_ARG,
  TORII_RUN_ID_ARG,
  TORII_STEP_ID_ARG,
  resolveTaskLimits,
  type Logger,
  type Task,
} from "@keidai/shared";
import type { RuntimeConfig } from "../config/runtime-config.js";
import { defaultLogger } from "../logging/logger.js";
import { createOpenRouterModel } from "../model/openrouter.js";
import { connectToriiSession } from "../mcp/torii-client.js";
import { toriiBaseUrlFromMcpUrl } from "../mcp/torii-approval-client.js";
import { createPollingApprovalResumeSignal } from "./approval-resume-signal.js";
import { buildToolSet, createModelStepCaller } from "./model-step.js";
import { taskGoalPrompt, taskSystemPrompt } from "./prompts.js";
import { createLocalRunReporter } from "./run-reporter.js";
import { completeRun, createRun } from "./run-lifecycle.js";
import { ModelToolCall, ToolDispatchOptions } from "./types/task-loop.js";
import { HarnessRunResult } from "./types/harness.js";
import { runTaskLoop } from "./task-loop.js";
import { runStore } from "../runs/run-store.js";

function previewOf(value: string, maxLength = 200): string {
  const flattened = value.replace(/\s+/g, " ").trim();
  return flattened.length > maxLength
    ? `${flattened.slice(0, maxLength)}…`
    : flattened;
}

export interface HarnessRunOptions {
  logger?: Logger;
}

export interface LaunchedHarnessRun {
  runId: string;
  done: Promise<HarnessRunResult>;
}

/**
 * Registers a run in the store synchronously, then drives the harness in the
 * background. Use this from HTTP so the client can observe the run immediately.
 */
export function launchHarnessRun(
  task: Task,
  config: RuntimeConfig,
  options: HarnessRunOptions = {},
): LaunchedHarnessRun {
  const logger = options.logger ?? defaultLogger;
  const limits = resolveTaskLimits(task);
  const runDraft = createRun(randomUUID(), {
    ...task,
    limits,
  });
  const reporter = createLocalRunReporter(runStore, runDraft.id);
  reporter.startRun({
    id: runDraft.id,
    assignee: task.assignee,
    goal: task.goal,
    startedAt: runDraft.startedAt,
  });

  const done = driveHarnessRun(runDraft, task, config, reporter, logger);
  return { runId: runDraft.id, done };
}

export async function startHarnessRun(
  task: Task,
  config: RuntimeConfig,
  options: HarnessRunOptions = {},
): Promise<HarnessRunResult> {
  const { done } = launchHarnessRun(task, config, options);
  return done;
}

async function driveHarnessRun(
  runDraft: ReturnType<typeof createRun>,
  task: Task,
  config: RuntimeConfig,
  reporter: ReturnType<typeof createLocalRunReporter>,
  logger: Logger,
): Promise<HarnessRunResult> {
  const limits = resolveTaskLimits(task);
  const toriiBaseUrl = toriiBaseUrlFromMcpUrl(config.toriiMcpUrl);
  const resumeSignal = createPollingApprovalResumeSignal(toriiBaseUrl);

  try {
    const session = await connectToriiSession(
      config.toriiMcpUrl,
      config.bearerToken,
    );

    try {
      logger.info("run.tools_discovered", {
        runId: runDraft.id,
        agentId: config.agentId,
        toolCount: session.tools.length,
        tools: session.tools.map((tool) => tool.name),
      });

      const availableToolNames = new Set(session.tools.map((tool) => tool.name));
      const dispatchToolCall = async (
        call: ModelToolCall,
        options?: ToolDispatchOptions,
      ) => {
        if (!availableToolNames.has(call.toolName)) {
          throw new Error("tool is not available from Torii");
        }

        const correlationStepId = options?.stepId ?? randomUUID();
        const args = {
          ...call.input,
          [TORII_RUN_ID_ARG]: options?.runId ?? runDraft.id,
          [TORII_STEP_ID_ARG]: correlationStepId,
          ...(options?.approvalId
            ? { [TORII_APPROVAL_ID_ARG]: options.approvalId }
            : {}),
        };

        logger.info("run.tool_dispatch", {
          runId: runDraft.id,
          toolName: call.toolName,
          inputPreview: previewOf(JSON.stringify(call.input)),
        });
        reporter.recordStep({
          id: correlationStepId,
          kind: "tool_dispatch",
          toolName: call.toolName,
          toolCallId: call.toolCallId,
          inputPreview: previewOf(JSON.stringify(call.input)),
        });
        const result = await session.callTool(call.toolName, args);
        logger.info("run.tool_result", {
          runId: runDraft.id,
          toolName: call.toolName,
          status: result.isError
            ? "error"
            : result.approvalRequired
              ? "approval_required"
              : "ok",
          charCount: result.text.length,
        });
        reporter.recordStep({
          id: correlationStepId,
          kind: "tool_result",
          toolName: call.toolName,
          toolCallId: call.toolCallId,
          status: result.isError
            ? "error"
            : result.approvalRequired
              ? "approval_required"
              : "ok",
          charCount: result.text.length,
          ...(result.meta?.traceId ? { traceId: result.meta.traceId } : {}),
        });

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

      const baseCallModel = createModelStepCaller(
        createOpenRouterModel(config.openRouterApiKey, config.modelId),
        taskSystemPrompt(config.agentId),
        buildToolSet(session.tools),
      );

      const callModel = async (
        history: Parameters<typeof baseCallModel>[0],
      ) => {
        const step = await baseCallModel(history);
        const toolSummary =
          step.toolCalls.length > 0
            ? ` (${step.toolCalls.map((call) => call.toolName).join(", ")})`
            : "";
        reporter.recordStep({
          kind: "model",
          text: step.text
            ? `${previewOf(step.text, 500)}${toolSummary}`
            : toolSummary.trim() || undefined,
        });
        return step;
      };

      const waitForApproval = async (
        approvalId: string,
        context?: { stepId?: string },
      ) => {
        const pollUrl = `${toriiBaseUrl}/api/approvals/${approvalId}`;
        logger.info("run.waiting_approval", {
          runId: runDraft.id,
          approvalId,
          stepId: context?.stepId,
          pollUrl,
        });
        reporter.recordStep({
          id: context?.stepId,
          kind: "waiting_approval",
          approvalId,
        });
        return resumeSignal.waitForDecision(approvalId);
      };

      logger.info("run.started", {
        runId: runDraft.id,
        modelId: config.modelId,
        assignee: task.assignee,
      });
      const { outcome, iterations, history } = await runTaskLoop(
        taskGoalPrompt(task.goal),
        limits,
        {
          callModel,
          dispatchToolCall,
          waitForApproval,
        },
      );

      if (outcome.status === "goal_met") {
        const finalEntry = history.at(-1);
        if (finalEntry?.role === "assistant" && finalEntry.text) {
          logger.info("run.goal_met", {
            runId: runDraft.id,
            responseLength: finalEntry.text.length,
            response: finalEntry.text,
          });
        }
      }

      const run = completeRun(runDraft, outcome);
      reporter.complete(outcome);
      logger.info("run.completed", {
        runId: run.id,
        iterations,
        outcome,
      });

      return { run, discoveredTools: session.tools, iterations };
    } finally {
      await session.close();
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    const existing = runStore.getRun(runDraft.id);
    if (existing?.status === "running") {
      reporter.complete({ status: "failed", reason });
    }
    throw error;
  }
}
