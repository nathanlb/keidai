import type { Client } from "@modelcontextprotocol/client";
import type { ServerConfig } from "@keidai/shared";

export type McpClient = Client;

export interface McpClientConnector {
  connect(server: ServerConfig): Promise<McpClient>;
}
