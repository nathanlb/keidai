import type { Client } from "@modelcontextprotocol/client";
import type { ServerConfig } from "@keidai/shared";

export type ConnectionState = "connecting" | "connected" | "failed";

export interface BackendConnection {
  config: ServerConfig;
  state: ConnectionState;
  client: Client | null;
  error?: Error;
}
