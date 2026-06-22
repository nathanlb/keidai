import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

export async function callGatewayTool(
  gatewayUrl: string,
  bearerToken: string,
  toolName: string,
  args: Record<string, unknown> = {},
): Promise<unknown> {
  const client = new Client({
    name: "demo-agent-policy-check",
    version: "1.0.0",
  });
  const transport = new StreamableHTTPClientTransport(new URL(gatewayUrl), {
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

  try {
    return await client.callTool({
      name: toolName,
      arguments: args,
    });
  } finally {
    await client.close();
  }
}

export async function assertNotionWritePolicyDenied(
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
    if (!/policy_denied/i.test(message)) {
      throw error;
    }
    return message;
  }
}
