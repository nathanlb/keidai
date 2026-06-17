import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { ServerConfig } from "@torii/shared";

export type McpClient = Client;

export interface McpClientConnector {
  connect(server: ServerConfig): Promise<McpClient>;
}
