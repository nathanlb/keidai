import "../load-env.js";
import type { RunStep, Task, TerminationOutcome } from "@keidai/shared";
import type { RuntimeConfig } from "../../src/config/runtime-config.js";
import { defaultLogger } from "../../src/logging/logger.js";
import { pollAssigneeMcpTask } from "../../src/mcp/torii-client.js";
import {
  createToriiCredential,
  resumeHarnessRun,
  startHarnessRun,
} from "../../src/run/harness.js";
import { resumeParkedHarnessRuns } from "../../src/run/resume-parked-runs.js";
import type { RunStore } from "../../src/runs/run-store.js";
import { createEvalPersistence } from "../../src/testing/persistence.js";
import { EVAL_BEARER } from "./torii-eval-stack.js";
import type { EvalToriiStack } from "./torii-eval-stack.js";

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(
      `Missing required environment variable for live eval: ${name}`,
    );
  }
  return value;
}

export function loadLiveEvalConfig(stack: EvalToriiStack): RuntimeConfig {
  const bearer = process.env.SHAIDEN_BEARER?.trim() ?? EVAL_BEARER;
  return {
    toriiMcpUrl: stack.mcpUrl,
    getSubjectToken: () => bearer,
    openRouterApiKey: requiredEnv("OPEN_ROUTER_API_KEY"),
    modelId: process.env.SHAIDEN_MODEL_ID?.trim() ?? "deepseek/deepseek-v4.1-flash",
    httpHost: "127.0.0.1",
    httpPort: 3200,
  };
}

export type ApprovalDriverMode = "approve" | "none";

export interface LiveHarnessEvalResult {
  outcome: TerminationOutcome;
  iterations: number;
  runId: string;
  steps: RunStep[];
}

export async function runLiveHarnessEval(input: {
  task: Task;
  stack: EvalToriiStack;
  approvalDriver?: ApprovalDriverMode;
}): Promise<LiveHarnessEvalResult> {
  const config = loadLiveEvalConfig(input.stack);
  const persistence = createEvalPersistence();
  const taskId = (await persistence.taskRepository.create({ task: input.task }))
    .id;
  const driverAbort = new AbortController();
  const approvalDriver = input.approvalDriver ?? "none";

  const driver =
    approvalDriver === "none"
      ? undefined
      : pollAndApprovePending({
          baseUrl: input.stack.httpBaseUrl,
          signal: driverAbort.signal,
        });

  try {
    const result = await startHarnessRun(
      input.task,
      taskId,
      config,
      persistence.runStore,
      { replicaId: "eval" },
    );
    await wakeUntilFinished({
      runId: result.run.id,
      config,
      runStore: persistence.runStore,
    });
    const run = await persistence.runStore.getRun(result.run.id);
    if (!run?.outcome) {
      throw new Error(`live eval run ${result.run.id} finished without an outcome`);
    }
    return {
      outcome: run.outcome,
      iterations: result.iterations,
      runId: result.run.id,
      steps: run.steps,
    };
  } finally {
    driverAbort.abort();
    if (driver) {
      await driver.catch(() => {});
    }
    await persistence.close();
  }
}

async function pollAndApprovePending(input: {
  baseUrl: string;
  signal: AbortSignal;
}): Promise<void> {
  while (!input.signal.aborted) {
    const response = await fetch(
      `${input.baseUrl}/api/approvals?status=pending&limit=20`,
    );
    if (!response.ok) {
      throw new Error(`failed to list pending approvals: ${response.status}`);
    }

    const body = (await response.json()) as Array<{ id: string }>;
    if (!Array.isArray(body)) {
      throw new Error("expected approvals list to be an array");
    }

    for (const approval of body) {
      const resolveResponse = await fetch(
        `${input.baseUrl}/api/approvals/${approval.id}/approve`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{}",
        },
      );
      if (!resolveResponse.ok) {
        throw new Error(
          `failed to approve approval ${approval.id}: ${resolveResponse.status}`,
        );
      }
    }

    await sleep(50);
  }
}

async function wakeUntilFinished(input: {
  runId: string;
  config: RuntimeConfig;
  runStore: RunStore;
}): Promise<void> {
  for (;;) {
    const run = await input.runStore.getRun(input.runId);
    if (!run || run.status !== "running") {
      return;
    }
    await resumeParkedHarnessRuns({
      runStore: input.runStore,
      replicaId: "eval",
      resumeHarnessRun: (resume) =>
        resumeHarnessRun({
          ...resume,
          config: input.config,
          options: { replicaId: "eval" },
        }),
      pollParkedTask: (parked, task) =>
        pollAssigneeMcpTask({
          toriiMcpUrl: input.config.toriiMcpUrl,
          credential: createToriiCredential(
            input.config,
            undefined,
            task.assignee,
          ),
          taskId: parked.mcpTaskId,
          pollIntervalMs: parked.pollIntervalMs,
        }),
      logger: defaultLogger,
    });
    await sleep(250);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
