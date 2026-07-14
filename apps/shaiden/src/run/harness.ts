import { randomUUID } from "node:crypto";
import {
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
import { createHarnessToolDispatcher } from "./harness-tool-dispatch.js";
import { buildToolSet, createModelStepCaller } from "./model-step.js";
import { taskGoalPrompt, taskSystemPrompt } from "./prompts.js";
import { previewOf } from "./run-step-recording.js";
import { createLocalRunReporter } from "./run-reporter.js";
import { completeRun, createRun } from "./run-lifecycle.js";
import { HarnessRunResult } from "./types/harness.js";
import { runTaskLoop } from "./task-loop.js";
import type { RunStore } from "../runs/run-store.js";

export interface HarnessRunOptions {
  logger?: Logger;
  runStore?: RunStore;
}

export interface LaunchHarnessRunInput {
  task: Task;
  taskId: string;
  config: RuntimeConfig;
  runStore: RunStore;
  options?: HarnessRunOptions;
}

export interface LaunchedHarnessRun {
  runId: string;
  done: Promise<HarnessRunResult>;
}

/**
 * Registers a run in the store synchronously, then drives the harness in the
 * background. Use this from HTTP so the client can observe the run immediately.
 */
export function launchHarnessRun({
  task,
  taskId,
  config,
  runStore,
  options = {},
}: LaunchHarnessRunInput): LaunchedHarnessRun {
  const logger = options.logger ?? defaultLogger;
  const limits = resolveTaskLimits(task);
  const runDraft = createRun(randomUUID(), {
    ...task,
    limits,
  });
  const reporter = createLocalRunReporter(runStore, runDraft.id);
  reporter.startRun({
    id: runDraft.id,
    taskId,
    task,
    assignee: task.assignee,
    goal: task.goal,
    startedAt: runDraft.startedAt,
  });

  const done = driveHarnessRun(runDraft, task, config, reporter, logger, runStore);
  return { runId: runDraft.id, done };
}

export async function startHarnessRun(
  task: Task,
  taskId: string,
  config: RuntimeConfig,
  runStore: RunStore,
  options: HarnessRunOptions = {},
): Promise<HarnessRunResult> {
  const { done } = launchHarnessRun({ task, taskId, config, runStore, options });
  return done;
}

async function driveHarnessRun(
  runDraft: ReturnType<typeof createRun>,
  task: Task,
  config: RuntimeConfig,
  reporter: ReturnType<typeof createLocalRunReporter>,
  logger: Logger,
  runStore: RunStore,
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
      const dispatchToolCall = createHarnessToolDispatcher({
        runId: runDraft.id,
        reporter,
        availableToolNames,
        callTool: (toolName, args) => session.callTool(toolName, args),
        logger,
      });

      const baseCallModel = createModelStepCaller(
        createOpenRouterModel(config.openRouterApiKey, config.modelId),
        taskSystemPrompt(config.agentId),
        buildToolSet(session.tools),
      );

      const callModel = async (
        history: Parameters<typeof baseCallModel>[0],
      ) => {
        const step = await baseCallModel(history);
        reporter.recordStep({
          kind: "model",
          text: step.text ? previewOf(step.text, 500) : undefined,
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
