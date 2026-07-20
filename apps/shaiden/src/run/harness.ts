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
import {
  ActiveRunRegistry,
  createActiveRunHandle,
} from "./active-run-registry.js";
import { createHarnessToolDispatcher } from "./harness-tool-dispatch.js";
import { buildToolSet, createModelStepCaller } from "./model-step.js";
import { taskGoalPrompt, taskSystemPrompt } from "./prompts.js";
import { completeRunWithOutcomeStep } from "./run-completion.js";
import { previewOf } from "./run-step-recording.js";
import { createLocalRunReporter } from "./run-reporter.js";
import { completeRun, createRun } from "./run-lifecycle.js";
import { HarnessRunResult } from "./types/harness.js";
import type { ConversationEntry } from "./types/conversation-history.js";
import { runTaskLoop } from "./task-loop.js";
import type { RunStore } from "../runs/run-store.js";

export interface HarnessRunOptions {
  logger?: Logger;
  runStore?: RunStore;
  activeRunRegistry?: ActiveRunRegistry;
}

export interface LaunchHarnessRunInput {
  task: Task;
  taskId: string;
  config: RuntimeConfig;
  runStore: RunStore;
  options?: HarnessRunOptions;
}

export interface ResumeHarnessRunInput {
  runId: string;
  initialHistory: ConversationEntry[];
  task: Task;
  config: RuntimeConfig;
  runStore: RunStore;
  options?: HarnessRunOptions;
}

export interface LaunchedHarnessRun {
  runId: string;
  done: Promise<HarnessRunResult>;
}

interface DriveHarnessRunInput {
  runId: string;
  task: Task;
  config: RuntimeConfig;
  reporter: ReturnType<typeof createLocalRunReporter>;
  logger: Logger;
  runStore: RunStore;
  initialHistory: ConversationEntry[];
  activeRunRegistry: ActiveRunRegistry;
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

  const initialHistory: ConversationEntry[] = [
    { role: "user", text: taskGoalPrompt(task.goal) },
  ];
  runStore.setConversationHistory(runDraft.id, initialHistory);

  const done = driveHarnessRun({
    runId: runDraft.id,
    task,
    config,
    reporter,
    logger,
    runStore,
    initialHistory,
    activeRunRegistry: options.activeRunRegistry ?? new ActiveRunRegistry(),
  }).then((result) => result);

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

export function resumeHarnessRun({
  runId,
  initialHistory,
  task,
  config,
  runStore,
  options = {},
}: ResumeHarnessRunInput): LaunchedHarnessRun {
  const logger = options.logger ?? defaultLogger;
  const reporter = createLocalRunReporter(runStore, runId);

  const done = driveHarnessRun({
    runId,
    task,
    config,
    reporter,
    logger,
    runStore,
    initialHistory,
    activeRunRegistry: options.activeRunRegistry ?? new ActiveRunRegistry(),
  }).catch((error) => {
    const reason = error instanceof Error ? error.message : String(error);
    const existing = runStore.getRun(runId);
    if (existing?.status === "running") {
      completeRunWithOutcomeStep(runStore, runId, {
        status: "failed",
        reason: `resume failed: ${reason}`,
      });
    }
    throw error;
  });

  return { runId, done };
}

async function driveHarnessRun({
  runId,
  task,
  config,
  reporter,
  logger,
  runStore,
  initialHistory,
  activeRunRegistry,
}: DriveHarnessRunInput): Promise<HarnessRunResult> {
  const limits = resolveTaskLimits(task);
  const activeHandle = createActiveRunHandle(runId);
  const unregisterActiveRun = activeRunRegistry.register(activeHandle);

  const runDraft = {
    id: runId,
    task,
    startedAt: runStore.getRun(runId)?.startedAt ?? new Date().toISOString(),
  };

  try {
    const session = await connectToriiSession(
      config.toriiMcpUrl,
      config.bearerToken,
    );
    const resumeSignal = session.createApprovalResumeSignal();

    try {
      logger.info("run.tools_discovered", {
        runId,
        agentId: config.agentId,
        toolCount: session.tools.length,
        tools: session.tools.map((tool) => tool.name),
      });

      const availableToolNames = new Set(session.tools.map((tool) => tool.name));
      const dispatchToolCall = createHarnessToolDispatcher({
        runId,
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
        logger.info("run.waiting_approval", {
          runId,
          approvalId,
          stepId: context?.stepId,
          wakeup: "mcp_notification",
        });
        reporter.recordStep({
          id: context?.stepId,
          kind: "waiting_approval",
          approvalId,
        });
        activeHandle.setWaitingForApproval(true);
        try {
          return await resumeSignal.waitForDecision(approvalId);
        } finally {
          activeHandle.setWaitingForApproval(false);
        }
      };

      logger.info("run.started", {
        runId,
        modelId: config.modelId,
        assignee: task.assignee,
      });

      const { outcome, iterations, history } = await runTaskLoop(
        { initialHistory, limits },
        {
          callModel,
          dispatchToolCall,
          waitForApproval,
          drainPendingUserMessages: () =>
            activeHandle.drainPendingUserMessages(),
          onHistoryChanged: (updatedHistory) => {
            runStore.setConversationHistory(runId, updatedHistory);
          },
        },
      );

      if (outcome.status === "goal_met") {
        const finalEntry = history.at(-1);
        if (finalEntry?.role === "assistant" && finalEntry.text) {
          logger.info("run.goal_met", {
            runId,
            responseLength: finalEntry.text.length,
            response: finalEntry.text,
          });
        }
      }

      runStore.setConversationHistory(runId, history);
      unregisterActiveRun();
      const run = completeRun(runDraft, outcome);
      completeRunWithOutcomeStep(runStore, runId, outcome);
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
    const existing = runStore.getRun(runId);
    unregisterActiveRun();
    if (existing?.status === "running") {
      completeRunWithOutcomeStep(runStore, runId, {
        status: "failed",
        reason,
      });
    }
    throw error;
  } finally {
    unregisterActiveRun();
  }
}
