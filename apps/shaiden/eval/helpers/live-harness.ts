import "../load-env.js";
import type { Task, TerminationOutcome } from "@keidai/shared";
import type { RuntimeConfig } from "../../src/config/runtime-config.js";
import { startHarnessRun } from "../../src/run/harness.js";
import { createTestPersistence } from "../../src/testing/persistence.js";
import { EVAL_AGENT_ID, EVAL_BEARER } from "./torii-eval-stack.js";
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
  return {
    agentId: process.env.SHAIDEN_AGENT_ID?.trim() ?? EVAL_AGENT_ID,
    toriiMcpUrl: stack.mcpUrl,
    bearerToken: process.env.SHAIDEN_BEARER?.trim() ?? EVAL_BEARER,
    openRouterApiKey: requiredEnv("OPEN_ROUTER_API_KEY"),
    modelId: process.env.SHAIDEN_MODEL_ID?.trim() ?? "google/gemini-2.5-flash",
    httpHost: "127.0.0.1",
    httpPort: 3200,
  };
}

export type ApprovalDriverMode = "approve" | "reject" | "none";

export interface LiveHarnessEvalResult {
  outcome: TerminationOutcome;
  iterations: number;
  runId: string;
}

export async function runLiveHarnessEval(input: {
  task: Task;
  stack: EvalToriiStack;
  approvalDriver?: ApprovalDriverMode;
  rejectReason?: string;
}): Promise<LiveHarnessEvalResult> {
  const config = loadLiveEvalConfig(input.stack);
  const persistence = createTestPersistence("memory");
  const taskId = persistence.taskRepository.create({ task: input.task }).id;
  const driverAbort = new AbortController();
  const approvalDriver = input.approvalDriver ?? "none";

  const driver =
    approvalDriver === "none"
      ? undefined
      : pollAndResolveApprovals({
          baseUrl: input.stack.httpBaseUrl,
          mode: approvalDriver,
          rejectReason: input.rejectReason,
          signal: driverAbort.signal,
        });

  try {
    const result = await startHarnessRun(
      input.task,
      taskId,
      config,
      persistence.runStore,
    );
    return {
      outcome: result.run.outcome,
      iterations: result.iterations,
      runId: result.run.id,
    };
  } finally {
    driverAbort.abort();
    if (driver) {
      await driver.catch(() => {});
    }
    persistence.close();
  }
}

async function pollAndResolveApprovals(input: {
  baseUrl: string;
  mode: "approve" | "reject";
  rejectReason?: string;
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
      const endpoint =
        input.mode === "approve"
          ? `${input.baseUrl}/api/approvals/${approval.id}/approve`
          : `${input.baseUrl}/api/approvals/${approval.id}/reject`;
      const resolveResponse = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          input.mode === "reject"
            ? { reason: input.rejectReason ?? "eval rejection" }
            : {},
        ),
      });
      if (!resolveResponse.ok) {
        throw new Error(
          `failed to ${input.mode} approval ${approval.id}: ${resolveResponse.status}`,
        );
      }
    }

    await sleep(50);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
