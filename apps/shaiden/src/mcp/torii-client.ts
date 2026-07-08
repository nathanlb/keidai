import { Client } from "@modelcontextprotocol/sdk/client";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { DiscoveredTool, ToriiToolCatalog } from "./types.js";

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

export async function connectToriiToolCatalog(
  toriiMcpUrl: string,
  bearerToken: string,
): Promise<ToriiToolCatalog> {
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

  return {
    tools: result.tools.map(toDiscoveredTool),
    close: () => client.close(),
  };
}
