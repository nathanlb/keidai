import { randomUUID } from "node:crypto";
import {
  TORII_APPROVAL_ID_ARG,
  TORII_RUN_ID_ARG,
  resolveTaskLimits,
  type Task,
} from "@keidai/shared";
import type { RuntimeConfig } from "../config/runtime-config.js";
import { createOpenRouterModel } from "../model/openrouter.js";
import { connectToriiSession } from "../mcp/torii-client.js";
import {
  pollApprovalDecision,
  toriiBaseUrlFromMcpUrl,
} from "../mcp/torii-approval-client.js";
import { buildToolSet, createModelStepCaller } from "./model-step.js";
import { taskGoalPrompt, taskSystemPrompt } from "./prompts.js";
import { completeRun, createRun } from "./run-lifecycle.js";
import { ModelToolCall, ToolDispatchOptions } from "./types/task-loop.js";
import { HarnessRunResult } from "./types/harness.js";
import { runTaskLoop } from "./task-loop.js";

function previewOf(value: string, maxLength = 200): string {
  const flattened = value.replace(/\s+/g, " ").trim();
  return flattened.length > maxLength
    ? `${flattened.slice(0, maxLength)}…`
    : flattened;
}

export async function startHarnessRun(
  task: Task,
  config: RuntimeConfig,
): Promise<HarnessRunResult> {
  const limits = resolveTaskLimits(task);
  const runDraft = createRun(randomUUID(), {
    ...task,
    limits,
  });
  const toriiBaseUrl = toriiBaseUrlFromMcpUrl(config.toriiMcpUrl);

  const session = await connectToriiSession(
    config.toriiMcpUrl,
    config.bearerToken,
  );

  try {
    console.log(
      `Discovered ${session.tools.length} Torii tool(s) for agent ${config.agentId}.`,
    );
    for (const tool of session.tools) {
      console.log(`  - ${tool.name}`);
    }

    const availableToolNames = new Set(session.tools.map((tool) => tool.name));
    const dispatchToolCall = async (
      call: ModelToolCall,
      options?: ToolDispatchOptions,
    ) => {
      if (!availableToolNames.has(call.toolName)) {
        throw new Error("tool is not available from Torii");
      }

      const args = {
        ...call.input,
        [TORII_RUN_ID_ARG]: options?.runId ?? runDraft.id,
        ...(options?.approvalId
          ? { [TORII_APPROVAL_ID_ARG]: options.approvalId }
          : {}),
      };

      console.log(`→ ${call.toolName}(${previewOf(JSON.stringify(call.input))})`);
      const result = await session.callTool(call.toolName, args);
      console.log(
        `← ${call.toolName}: ${result.isError ? "error" : result.approvalRequired ? "approval_required" : "ok"} (${result.text.length} chars)`,
      );
      return result;
    };

    const callModel = createModelStepCaller(
      createOpenRouterModel(config.openRouterApiKey, config.modelId),
      taskSystemPrompt(config.agentId),
      buildToolSet(session.tools),
    );

    const waitForApproval = async (approvalId: string) => {
      console.log(
        `Run ${runDraft.id} waiting for approval ${approvalId} (poll ${toriiBaseUrl}/api/approvals/${approvalId}).`,
      );
      return pollApprovalDecision(toriiBaseUrl, approvalId);
    };

    console.log(`Run ${runDraft.id} started (model: ${config.modelId}).`);
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
        console.log(`\n--- Final response ---\n${finalEntry.text}\n--- End final response ---\n`);
      }
    }

    const run = completeRun(runDraft, outcome);
    console.log(
      `Run ${run.id} completed after ${iterations} iteration(s) with outcome: ${run.outcome.status}` +
        (run.outcome.status === "failed" ? ` — ${run.outcome.reason}` : ""),
    );

    return { run, discoveredTools: session.tools, iterations };
  } finally {
    await session.close();
  }
}
