/**
 * Scenario assertions for the open-torii status digest demo.
 *
 * Tool names are matched loosely: gateways expose `server.tool` names while some
 * models report `server_tool` instead. Discovery helpers like `get_tools` are ignored.
 *
 * Digest report text quality is not asserted here; that belongs in a future eval
 * harness with a judge model.
 */
import { callGatewayTool } from "./gateway-mcp.js";

export interface DigestToolCall {
  toolName: string;
}

export interface DigestToolResult {
  type: string;
  error?: unknown;
}

export interface DigestStep {
  toolCalls: DigestToolCall[];
  toolResults: DigestToolResult[];
}

export interface DigestResult {
  text: string;
  steps: DigestStep[];
}

const SOURCE_BACKEND_TOOL_PREFIX = {
  linear: /^linear[._]/,
  github: /^github[._]/,
  notion: /^notion[._]/,
} as const;

const GMAIL_TOOL_PATTERN = /^gmail[._]/;

const META_DISCOVERY_TOOLS = new Set(["get_tools", "list_tools"]);

const NOTION_WRITE_PATTERN = /notion[._-](create|update)/i;

const POLICY_DENIED_PATTERN = /policy_denied/i;

function isAllowedDigestTool(name: string): boolean {
  if (META_DISCOVERY_TOOLS.has(name)) {
    return true;
  }
  if (NOTION_WRITE_PATTERN.test(name)) {
    return false;
  }
  return (
    Object.values(SOURCE_BACKEND_TOOL_PREFIX).some((pattern) =>
      pattern.test(name),
    ) || GMAIL_TOOL_PATTERN.test(name)
  );
}

export function collectToolCallNames(result: DigestResult): string[] {
  return result.steps.flatMap((step) =>
    step.toolCalls.map((toolCall) => toolCall.toolName),
  );
}

export function assertDigestToolCalls(toolNames: string[]): void {
  for (const [backend, pattern] of Object.entries(SOURCE_BACKEND_TOOL_PREFIX)) {
    if (!toolNames.some((name) => pattern.test(name))) {
      throw new Error(
        `Expected a ${backend} tool call while gathering status, got: ${toolNames.join(", ") || "(none)"}`,
      );
    }
  }

  for (const name of toolNames) {
    if (!isAllowedDigestTool(name)) {
      throw new Error(`Unexpected tool call during digest scenario: ${name}`);
    }
  }
}

export function assertDigestEmailSent(toolNames: string[]): void {
  if (!toolNames.some((name) => GMAIL_TOOL_PATTERN.test(name))) {
    throw new Error(
      `Expected a gmail tool call to send the report, got: ${toolNames.join(", ") || "(none)"}`,
    );
  }
}

export function assertDigestAndEmailPhase(result: DigestResult): void {
  const toolNames = collectToolCallNames(result);
  assertDigestToolCalls(toolNames);
  assertDigestEmailSent(toolNames);
}

export function assertDigestPhase(result: DigestResult): void {
  assertDigestToolCalls(collectToolCallNames(result));
}

export function assertEmailPhase(result: DigestResult): void {
  assertDigestEmailSent(collectToolCallNames(result));
}

export function assertPolicyDeniedVisible(
  result: DigestResult,
  output: string,
): void {
  const stepErrors = result.steps.flatMap((step) =>
    step.toolResults
      .filter((toolResult) => toolResult.type === "tool-error")
      .map((toolResult) => toolResult.error),
  );

  const serialized = [
    output,
    ...stepErrors.map((error) =>
      error instanceof Error ? error.message : String(error),
    ),
  ].join("\n");

  if (!POLICY_DENIED_PATTERN.test(serialized)) {
    throw new Error(
      `Expected policy_denied in follow-up output, got:\n${serialized}`,
    );
  }
}

export function assertNotionFollowUpPhase(
  result: DigestResult,
  output: string,
): void {
  assertPolicyDeniedVisible(result, output);
}

export async function assertDirectNotionWriteDenied(
  gatewayUrl: string,
  bearerToken: string,
): Promise<string> {
  try {
    await callGatewayTool(gatewayUrl, bearerToken, "notion.notion-create-pages", {
      title: "open-torii status digest",
    });
    throw new Error("Expected policy_denied for notion.notion-create-pages");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!POLICY_DENIED_PATTERN.test(message)) {
      throw error;
    }
    return message;
  }
}
