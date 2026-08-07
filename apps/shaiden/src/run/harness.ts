import { randomUUID } from "node:crypto";
import {
  resolveTaskLimits,
  type Logger,
  type Task,
} from "@keidai/shared";
import {
  AgentDefinitionError,
  createHttpFudaClient,
  TokenExchangeError,
  type FudaClient,
} from "@keidai/shared/clients";
import type { RuntimeConfig } from "../config/runtime-config.js";
import { createAgentTokenProvider } from "../fuda/agent-token-provider.js";
import { defaultLogger } from "../logging/logger.js";
import { createOpenRouterModel } from "../model/openrouter.js";
import { connectToriiSession } from "../mcp/torii-client.js";
import type { ToriiSessionCredential } from "../mcp/types/index.js";
import {
  ActiveRunRegistry,
  createActiveRunHandle,
} from "./active-run-registry.js";
import { createHarnessToolDispatcher } from "./harness-tool-dispatch.js";
import { buildToolSet, createModelStepCaller } from "./model-step.js";
import {
  systemPromptFromPersona,
  taskGoalPrompt,
  taskSystemPrompt,
} from "./prompts.js";
import { completeRunWithOutcomeStep } from "./run-completion.js";
import { previewOf } from "./run-step-recording.js";
import { createLocalRunReporter } from "./run-reporter.js";
import { completeRun, createRun } from "./run-lifecycle.js";
import type {
  DriveHarnessRunInput,
  HarnessRunOptions,
  HarnessRunResult,
  LaunchedHarnessRun,
  LaunchHarnessRunInput,
  ResumeHarnessRunInput,
} from "./types/harness.js";
import type { ConversationEntry } from "./types/conversation-history.js";
import { runTaskLoop } from "./task-loop.js";
import type { RunStore } from "../runs/run-store.js";

function resolveFudaClient(
  config: RuntimeConfig,
  options: HarnessRunOptions,
): FudaClient | undefined {
  if (options.fudaClient) {
    return options.fudaClient;
  }
  if (!config.fudaBaseUrl) {
    return undefined;
  }
  return createHttpFudaClient({ baseUrl: config.fudaBaseUrl });
}

function createToriiCredential(
  config: RuntimeConfig,
  fudaClient: FudaClient | undefined,
  agentId: string,
): ToriiSessionCredential {
  if (!fudaClient) {
    // Eval / test path: Torii accepts a fixed principal without Fuda minting.
    return {
      ensureToken: async () => config.getSubjectToken(),
    };
  }

  const provider = createAgentTokenProvider({
    fuda: fudaClient,
    getSubjectToken: config.getSubjectToken,
    agentId,
  });
  return {
    ensureToken: (options) => provider.ensureToken(options),
  };
}

function describeTokenExchangeFailure(error: unknown): string {
  if (error instanceof TokenExchangeError) {
    if (error.kind === "grant_denied") {
      return `agent grant revoked: ${error.message}`;
    }
    if (error.kind === "unreachable") {
      return `Fuda unreachable: ${error.message}`;
    }
    return `token exchange failed (${error.kind}): ${error.message}`;
  }
  return error instanceof Error ? error.message : String(error);
}

/**
 * Cold-path fetch of the agent definition at task start. Returns persona
 * content (+ version) to stamp onto the run so resume keeps the same system
 * prompt without re-fetching. When Fuda is not configured (evals), falls back
 * to the local worker prompt.
 */
async function resolvePersonaAtTaskStart(input: {
  assignee: string;
  fudaClient: FudaClient | undefined;
}): Promise<{
  systemPrompt: string;
  personaVersion?: number;
  persona?: string;
}> {
  const { assignee, fudaClient } = input;

  if (!fudaClient) {
    return { systemPrompt: taskSystemPrompt(assignee) };
  }

  const definition = await fudaClient.getAgentDefinition(assignee);
  return {
    systemPrompt: systemPromptFromPersona(definition.persona),
    personaVersion: definition.personaVersion,
    persona: definition.persona,
  };
}

/**
 * Resume must reuse the persona stamped on the run — never re-fetch current
 * from Fuda. When Fuda is configured, a missing stamp is a hard failure.
 */
function resolveSystemPromptForResume(input: {
  runId: string;
  task: Task;
  runStore: RunStore;
  fudaClient: FudaClient | undefined;
}): string {
  const saved = input.runStore.getRun(input.runId);
  if (saved?.persona) {
    return systemPromptFromPersona(saved.persona);
  }
  if (input.fudaClient) {
    throw new AgentDefinitionError(
      "unexpected",
      `Run ${input.runId} has no stamped persona; cannot resume with a Fuda-backed agent`,
    );
  }
  return taskSystemPrompt(input.task.assignee);
}

/**
 * Registers a run in the store after fetching the agent definition, then
 * drives the harness in the background. Definition fetch failures reject
 * before a run row is created.
 */
export async function launchHarnessRun({
  task,
  taskId,
  config,
  runStore,
  options = {},
}: LaunchHarnessRunInput): Promise<LaunchedHarnessRun> {
  const logger = options.logger ?? defaultLogger;
  const fudaClient = resolveFudaClient(config, options);
  const { systemPrompt, personaVersion, persona } =
    await resolvePersonaAtTaskStart({
      assignee: task.assignee,
      fudaClient,
    });

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
    personaVersion,
    persona,
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
    systemPrompt,
    fudaClient,
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
  const { done } = await launchHarnessRun({
    task,
    taskId,
    config,
    runStore,
    options,
  });
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
  const fudaClient = resolveFudaClient(config, options);
  const systemPrompt = resolveSystemPromptForResume({
    runId,
    task,
    runStore,
    fudaClient,
  });

  const done = driveHarnessRun({
    runId,
    task,
    config,
    reporter,
    logger,
    runStore,
    initialHistory,
    activeRunRegistry: options.activeRunRegistry ?? new ActiveRunRegistry(),
    systemPrompt,
    fudaClient,
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
  systemPrompt,
  fudaClient,
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
      createToriiCredential(config, fudaClient, task.assignee),
    );
    const resumeSignal = session.createApprovalResumeSignal();

    try {
      logger.info("run.tools_discovered", {
        runId,
        assignee: task.assignee,
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
        systemPrompt,
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
          const decision = await resumeSignal.waitForDecision(approvalId);
          // Re-mint on resume so revoked grants and group changes take effect
          // before the approved call is replayed.
          if (decision.status === "approved") {
            try {
              await session.remintCredentials();
            } catch (error) {
              throw new Error(
                `failed to remint agent token on approval resume: ${describeTokenExchangeFailure(error)}`,
              );
            }
          }
          return decision;
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
    const reason =
      error instanceof TokenExchangeError
        ? describeTokenExchangeFailure(error)
        : error instanceof Error
          ? error.message
          : String(error);
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
