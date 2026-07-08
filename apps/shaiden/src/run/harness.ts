import { randomUUID } from "node:crypto";
import {
  resolveTaskLimits,
  type Run,
  type Task,
  type TerminationOutcome,
} from "@keidai/shared";
import type { RuntimeConfig } from "../config/runtime-config.js";
import { connectToriiToolCatalog } from "../mcp/torii-client.js";
import type { DiscoveredTool } from "../mcp/types.js";
import { completeRun, createRun } from "./run-lifecycle.js";

const BOOTSTRAP_OUTCOME: TerminationOutcome = {
  status: "failed",
  reason: "task loop not implemented",
};

export interface HarnessBootstrapResult {
  run: Run;
  discoveredTools: DiscoveredTool[];
}

export async function startHarnessRun(
  task: Task,
  config: RuntimeConfig,
): Promise<HarnessBootstrapResult> {
  const limits = resolveTaskLimits(task);
  const runDraft = createRun(randomUUID(), {
    ...task,
    limits,
  });

  const catalog = await connectToriiToolCatalog(
    config.toriiMcpUrl,
    config.bearerToken,
  );

  try {
    const discoveredTools = catalog.tools;

    console.log(
      `Discovered ${discoveredTools.length} Torii tool(s) for agent ${config.agentId}.`,
    );
    for (const tool of discoveredTools) {
      console.log(`  - ${tool.name}`);
    }

    const run = completeRun(runDraft, BOOTSTRAP_OUTCOME);
    console.log(`Run ${run.id} completed with outcome: ${run.outcome.status}`);

    return { run, discoveredTools };
  } finally {
    await catalog.close();
  }
}
