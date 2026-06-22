import { experimental_createMCPClient as createMCPClient } from "@ai-sdk/mcp";
import {
  Experimental_Agent as ToolLoopAgent,
  stepCountIs,
  type ModelMessage,
  type ToolSet,
} from "ai";
import { createAgentStepLogger, logAgentRunSummary } from "./agent-loop-log.js";
import {
  extractDisplayedText,
  toAgentSnapshot,
  toDigestResult,
  type AgentGenerateSnapshot,
} from "./adapt-agent-result.js";
import {
  assertDigestAndEmailPhase,
  assertDirectNotionWriteDenied,
  assertNotionFollowUpPhase,
  collectToolCallNames,
} from "./assertions.js";
import type { DemoConfig } from "./config.js";
import { createOpenRouterModel } from "./model.js";
import {
  digestAndEmailPrompt,
  DIGEST_SYSTEM,
  NOTION_FOLLOW_UP_PROMPT,
} from "./prompts.js";

async function createDemoAgent(
  config: DemoConfig,
  phaseLabel: { current: string },
): Promise<{
  agent: ToolLoopAgent<ToolSet>;
  close: () => Promise<void>;
}> {
  const mcpClient = await createMCPClient({
    transport: {
      type: "http",
      url: config.toriiMcpUrl,
      headers: {
        Authorization: `Bearer ${config.toriiBearerToken}`,
      },
    },
  });

  // MCP client tool map shape differs slightly from AI SDK ToolSet expectations.
  const tools = (await mcpClient.tools()) as ToolSet;
  const agent = new ToolLoopAgent({
    model: createOpenRouterModel(config.openRouterApiKey, config.modelId),
    tools,
    system: DIGEST_SYSTEM,
    stopWhen: stepCountIs(25),
    onStepFinish: createAgentStepLogger(() => phaseLabel.current, {
      verbose: config.verbose,
    }),
  });

  return {
    agent,
    close: () => mcpClient.close(),
  };
}

async function runAgentGenerate(
  agent: ToolLoopAgent<ToolSet>,
  phaseLabel: { current: string },
  label: string,
  options: { prompt: string } | { messages: ModelMessage[] },
): Promise<AgentGenerateSnapshot> {
  phaseLabel.current = label;
  const result = await agent.generate(options);
  const snapshot = toAgentSnapshot(result);
  logAgentRunSummary(label, snapshot);
  return snapshot;
}

async function runDigestAndEmailPhase(
  agent: ToolLoopAgent<ToolSet>,
  phaseLabel: { current: string },
  config: DemoConfig,
): Promise<string> {
  const snapshot = await runAgentGenerate(agent, phaseLabel, "digest", {
    prompt: digestAndEmailPrompt(config.ownerEmail),
  });
  const parsed = toDigestResult(snapshot);
  const displayedText = extractDisplayedText(snapshot);

  console.log("\n--- Digest report ---\n");
  console.log(displayedText || "(empty)");
  console.log("\n--- End digest report ---\n");

  try {
    assertDigestAndEmailPhase(parsed);
  } catch (error) {
    console.error(
      `[digest] assertion failed after run with finishReason=${snapshot.finishReason}, toolCalls=${collectToolCallNames(parsed).join(", ") || "(none)"}`,
    );
    throw error;
  }

  return displayedText;
}

async function runNotionPolicyPhase(
  agent: ToolLoopAgent<ToolSet>,
  phaseLabel: { current: string },
  config: DemoConfig,
  digestText: string,
): Promise<void> {
  const messages: ModelMessage[] = [
    { role: "user", content: digestAndEmailPrompt(config.ownerEmail) },
    { role: "assistant", content: digestText },
    { role: "user", content: NOTION_FOLLOW_UP_PROMPT },
  ];
  const snapshot = await runAgentGenerate(agent, phaseLabel, "notion", { messages });
  const parsed = toDigestResult(snapshot);
  const displayedText = extractDisplayedText(snapshot);

  console.log("Follow-up response:\n");
  console.log(displayedText || "(empty)");

  try {
    assertNotionFollowUpPhase(parsed, displayedText);
  } catch (error) {
    console.error(
      `[notion] assertion failed after run with finishReason=${snapshot.finishReason}, toolCalls=${collectToolCallNames(parsed).join(", ") || "(none)"}`,
    );
    throw error;
  }

  const policyMessage = await assertDirectNotionWriteDenied(
    config.toriiMcpUrl,
    config.toriiBearerToken,
  );
  console.log("\nPolicy denial (direct tools/call):\n");
  console.log(policyMessage);
}

export async function runDemoScenario(config: DemoConfig): Promise<void> {
  const phaseLabel = { current: "demo" };
  const { agent, close } = await createDemoAgent(config, phaseLabel);

  try {
    console.log(`Running open-torii status digest scenario (${config.modelId})...\n`);
    if (config.verbose) {
      console.log(
        "Verbose agent loop logging enabled (DEMO_AGENT_VERBOSE=1).\n",
      );
    } else {
      console.log(
        "Per-step summaries are always logged. Set DEMO_AGENT_VERBOSE=1 for full tool I/O.\n",
      );
    }

    const digestText = await runDigestAndEmailPhase(agent, phaseLabel, config);
    await runNotionPolicyPhase(agent, phaseLabel, config, digestText);

    console.log("\nDemo scenario completed successfully.");
  } finally {
    await close();
  }
}
