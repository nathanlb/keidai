import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { ServerConfig } from "@torii/shared";

export type ConnectionState = "connecting" | "connected" | "failed";

export interface BackendConnection {
  config: ServerConfig;
  state: ConnectionState;
  client: Client | null;
  error?: Error;
}
