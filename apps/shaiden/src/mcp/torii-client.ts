import { Client } from "@modelcontextprotocol/sdk/client";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { enrichToolCallResult } from "./parse-tool-result.js";
import type { DiscoveredTool, ToolCallResult, ToriiSession } from "./types/index.js";

function toDiscoveredTool(tool: {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}): DiscoveredTool {
  return {
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
  };
}

function flattenToolContent(content: unknown): string {
  if (!Array.isArray(content)) {
    return "";
  }
  return content
    .map((part) =>
      part &&
      typeof part === "object" &&
      "type" in part &&
      part.type === "text" &&
      "text" in part
        ? String(part.text)
        : JSON.stringify(part),
    )
    .join("\n");
}

/**
 * Connect to Torii over MCP and keep the session open for the duration of a
 * run: tool discovery happens once at connect, tool calls dispatch through
 * the same session so they show up in Torii traces.
 */
export async function connectToriiSession(
  toriiMcpUrl: string,
  bearerToken: string,
): Promise<ToriiSession> {
  const client = new Client({
    name: "shaiden",
    version: "0.1.0",
  });
  const transport = new StreamableHTTPClientTransport(new URL(toriiMcpUrl), {
    requestInit: {
      headers: {
        Authorization: `Bearer ${bearerToken}`,
      },
    },
    reconnectionOptions: {
      maxReconnectionDelay: 1000,
      initialReconnectionDelay: 100,
      reconnectionDelayGrowFactor: 1.5,
      maxRetries: 0,
    },
  });

  await client.connect(transport);
  const result = await client.listTools();

  const callTool = async (
    name: string,
    args: Record<string, unknown>,
  ): Promise<ToolCallResult> => {
    const response = await client.callTool({ name, arguments: args });
    return enrichToolCallResult(
      response.isError === true,
      flattenToolContent(response.content),
    );
  };

  return {
    tools: result.tools.map(toDiscoveredTool),
    callTool,
    close: () => client.close(),
  };
}
