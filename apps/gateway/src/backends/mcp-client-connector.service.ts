import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { ServerConfig } from "@torii/shared";
import { injectable } from "tsyringe";
import type {
  McpClient,
  McpClientConnector,
} from "./types/mcp-client-connector.js";

@injectable()
export class DefaultMcpClientConnector implements McpClientConnector {
  async connect(server: ServerConfig): Promise<McpClient> {
    if (server.transport.type !== "http") {
      throw new Error(
        `Unsupported transport type for server "${server.name}"`,
      );
    }

    const client = new Client({
      name: "open-torii-gateway",
      version: "0.0.0",
    });
    const transport = new StreamableHTTPClientTransport(
      new URL(server.transport.url),
      {
        reconnectionOptions: {
          maxReconnectionDelay: 1000,
          initialReconnectionDelay: 100,
          reconnectionDelayGrowFactor: 1.5,
          maxRetries: 0,
        },
      },
    );

    await client.connect(transport);
    return client;
  }
}
