import { randomUUID } from "node:crypto";
import { resolveTaskLimits, type Task } from "@keidai/shared";
import type { RuntimeConfig } from "../config/runtime-config.js";
import { createOpenRouterModel } from "../model/openrouter.js";
import { connectToriiSession } from "../mcp/torii-client.js";
import { buildToolSet, createModelStepCaller } from "./model-step.js";
import { taskGoalPrompt, taskSystemPrompt } from "./prompts.js";
import { completeRun, createRun } from "./run-lifecycle.js";
import { ModelToolCall } from "./types/task-loop.js";
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
    const dispatchToolCall = async (call: ModelToolCall) => {
      if (!availableToolNames.has(call.toolName)) {
        throw new Error("tool is not available from Torii");
      }
      console.log(`→ ${call.toolName}(${previewOf(JSON.stringify(call.input))})`);
      const result = await session.callTool(call.toolName, call.input);
      console.log(
        `← ${call.toolName}: ${result.isError ? "error" : "ok"} (${result.text.length} chars)`,
      );
      return result;
    };

    const callModel = createModelStepCaller(
      createOpenRouterModel(config.openRouterApiKey, config.modelId),
      taskSystemPrompt(config.agentId),
      buildToolSet(session.tools),
    );

    console.log(`Run ${runDraft.id} started (model: ${config.modelId}).`);
    const { outcome, iterations, history } = await runTaskLoop(
      taskGoalPrompt(task.goal),
      limits,
      { callModel, dispatchToolCall },
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
