import { loadEnvForPackage } from "@keidai/shared";

loadEnvForPackage(import.meta.url);

import { anthropic } from "@ai-sdk/anthropic";
import { experimental_createMCPClient as createMCPClient } from "@ai-sdk/mcp";
import {
  Experimental_Agent as ToolLoopAgent,
  stepCountIs,
  type ToolSet,
} from "ai";
import {
  assertDigestReportShape,
  assertDigestToolCalls,
  collectToolCallNames,
  type DigestResult,
} from "./assertions.js";
import { loadDemoConfig } from "./config.js";
import { assertNotionWritePolicyDenied } from "./gateway-client.js";

const DIGEST_SYSTEM = `You are a status digest agent for the open-torii project.
Use the available MCP tools to gather project status, then compose a markdown report.

Report requirements:
- Subject line: open-torii status digest — {today's date in YYYY-MM-DD}
- Sections with exact headers: ## Linear, ## GitHub, ## Notion
- Include recognizable issue ids (e.g. NAT-16) when present in tool results
- After composing the report, send it via gmail.send_gmail_message to the owner email given in the user prompt
- Do not attempt Notion write/create/update tools`;

function toDigestResult(result: {
  text: string;
  steps: Array<{
    toolCalls: Array<{ toolName: string }>;
    toolResults: Array<{ type: string; error?: unknown }>;
  }>;
}): DigestResult {
  return {
    text: result.text,
    steps: result.steps.map((step) => ({
      toolCalls: step.toolCalls.map((toolCall) => ({
        toolName: toolCall.toolName,
      })),
      toolResults: step.toolResults.map((toolResult) => ({
        type: toolResult.type,
        error: toolResult.type === "tool-error" ? toolResult.error : undefined,
      })),
    })),
  };
}

async function main(): Promise<void> {
  const config = loadDemoConfig();
  const mcpClient = await createMCPClient({
    transport: {
      type: "http",
      url: config.toriiMcpUrl,
      headers: {
        Authorization: `Bearer ${config.toriiBearerToken}`,
      },
    },
  });

  try {
    const tools = (await mcpClient.tools()) as ToolSet;
    const agent = new ToolLoopAgent({
      model: anthropic(config.modelId),
      tools,
      system: DIGEST_SYSTEM,
      stopWhen: stepCountIs(25),
    });

    console.log("Running open-torii status digest scenario...\n");

    const digestPrompt = `Pull together a status report on open-torii from Linear, GitHub, and Notion, then email it to me at ${config.ownerEmail}.`;
    const digestResult = await agent.generate({ prompt: digestPrompt });

    const digestToolNames = collectToolCallNames(toDigestResult(digestResult));
    assertDigestToolCalls(digestToolNames);
    assertDigestReportShape(digestResult.text);

    console.log("Digest tool calls:", digestToolNames.join(", "));
    console.log("\n--- Digest report ---\n");
    console.log(digestResult.text);
    console.log("\n--- End digest report ---\n");

    const followUpPrompt =
      "Also post this report to Notion as a new page in the open-torii workspace.";
    const followUpResult = await agent.generate({ prompt: followUpPrompt });

    console.log("Follow-up response:\n");
    console.log(followUpResult.text);

    const policyMessage = await assertNotionWritePolicyDenied(
      config.toriiMcpUrl,
      config.toriiBearerToken,
    );
    console.log("\nPolicy denial (direct tools/call):\n");
    console.log(policyMessage);
    console.log("\nDemo scenario completed successfully.");
  } finally {
    await mcpClient.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
