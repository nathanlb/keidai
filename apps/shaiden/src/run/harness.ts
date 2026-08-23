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
  DEFAULT_RUN_LEASE_MS,
  isRunLeaseError,
  leaseExpiresAt,
  resolveReplicaId,
  RunLeaseLostError,
  RunNotClaimedError,
  startRunLeaseHeartbeat,
} from "./run-lease.js";
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
import { createParkedMcpTaskWaiter } from "./parked-mcp-task-waiter.js";
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
async function resolveSystemPromptForResume(input: {
  runId: string;
  task: Task;
  runStore: RunStore;
  fudaClient: FudaClient | undefined;
}): Promise<string> {
  const saved = await input.runStore.getRun(input.runId);
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
  await reporter.startRun({
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
  await runStore.setConversationHistory(runDraft.id, initialHistory);

  const done = driveHarnessRun({
    runId: runDraft.id,
    task,
    config,
    reporter,
    logger,
    runStore,
    initialHistory,
    replicaId: options.replicaId ?? resolveReplicaId(),
    leaseMs: options.leaseMs ?? DEFAULT_RUN_LEASE_MS,
    now: options.now ?? Date.now,
    systemPrompt,
    fudaClient,
    stopController: options.stopController,
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

export async function resumeHarnessRun({
  runId,
  initialHistory,
  task,
  config,
  runStore,
  options = {},
}: ResumeHarnessRunInput): Promise<LaunchedHarnessRun> {
  const logger = options.logger ?? defaultLogger;
  const reporter = createLocalRunReporter(runStore, runId);
  const fudaClient = resolveFudaClient(config, options);
  const systemPrompt = await resolveSystemPromptForResume({
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
    replicaId: options.replicaId ?? resolveReplicaId(),
    leaseMs: options.leaseMs ?? DEFAULT_RUN_LEASE_MS,
    now: options.now ?? Date.now,
    systemPrompt,
    fudaClient,
    stopController: options.stopController,
  }).catch(async (error) => {
    if (isRunLeaseError(error)) {
      throw error;
    }
    const reason = error instanceof Error ? error.message : String(error);
    const existing = await runStore.getRun(runId);
    if (existing?.status === "running") {
      await completeRunWithOutcomeStep(runStore, runId, {
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
  replicaId,
  leaseMs,
  now,
  systemPrompt,
  fudaClient,
  stopController,
}: DriveHarnessRunInput): Promise<HarnessRunResult> {
  const limits = resolveTaskLimits(task);
  const parked = await runStore.getParkedMcpTask(runId);
  const nowIso = () => new Date(now()).toISOString();
  if (
    !(await runStore.claimRun(
      runId,
      replicaId,
      leaseExpiresAt(now(), leaseMs),
      nowIso(),
    ))
  ) {
    logger.info("run.claim_skipped", { runId, replicaId });
    throw new RunNotClaimedError(runId);
  }

  const stopSignal = stopController?.attach(runId);

  let lostLease = false;
  const leaseAbort = new AbortController();
  const stopHeartbeat = startRunLeaseHeartbeat({
    runStore,
    runId,
    replicaId,
    leaseMs,
    now,
    onLost: () => {
      lostLease = true;
      leaseAbort.abort();
    },
  });

  const runDraft = {
    id: runId,
    task,
    startedAt: (await runStore.getRun(runId))?.startedAt ?? new Date().toISOString(),
  };

  try {
    const session = await connectToriiSession(
      config.toriiMcpUrl,
      createToriiCredential(config, fudaClient, task.assignee),
    );

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
        await reporter.recordStep({
          kind: "model",
          text: step.text ? previewOf(step.text, 500) : undefined,
        });
        return step;
      };

      const waitForApproval = createParkedMcpTaskWaiter({
        runId,
        runStore,
        replicaId,
        leaseMs,
        now,
        signal: leaseAbort.signal,
        pollMcpTask: (taskId, pollIntervalMs) =>
          session.pollMcpTask(taskId, pollIntervalMs),
        reporter,
        logger,
      });

      logger.info("run.started", {
        runId,
        modelId: config.modelId,
        assignee: task.assignee,
      });

      const { outcome, iterations, history } = await runTaskLoop(
        {
          initialHistory,
          limits,
          ...(parked
            ? {
                resumeParkedApproval: {
                  approvalId: parked.mcpTaskId,
                },
              }
            : {}),
        },
        {
          callModel,
          dispatchToolCall,
          waitForApproval,
          drainPendingUserMessages: () =>
            runStore.drainParkedFollowUps(runId),
          onHistoryChanged: async (updatedHistory) => {
            await runStore.setConversationHistory(runId, updatedHistory);
          },
          stopSignal,
        },
      );

      if (lostLease) {
        throw new RunLeaseLostError(runId);
      }

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

      await runStore.setConversationHistory(runId, history);
      const run = completeRun(runDraft, outcome);
      await completeRunWithOutcomeStep(runStore, runId, outcome);
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
    if (isRunLeaseError(error) || lostLease) {
      logger.info("run.lease_released", {
        runId,
        replicaId,
        reason: error instanceof Error ? error.message : String(error),
      });
      throw error instanceof RunLeaseLostError ||
        error instanceof RunNotClaimedError
        ? error
        : new RunLeaseLostError(runId);
    }
    const reason =
      error instanceof TokenExchangeError
        ? describeTokenExchangeFailure(error)
        : error instanceof Error
          ? error.message
          : String(error);
    const existing = await runStore.getRun(runId);
    if (existing?.status === "running") {
      await completeRunWithOutcomeStep(runStore, runId, {
        status: "failed",
        reason,
      });
    }
    throw error;
  } finally {
    stopHeartbeat();
    stopController?.release(runId);
    if (!lostLease) {
      await runStore.releaseRun(runId, replicaId);
    }
  }
}
