import type { AgentPrincipal } from "@keidai/shared";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { injectable } from "tsyringe";

export interface McpSessionEntry {
  transport: StreamableHTTPServerTransport;
  mcpServer: McpServer;
  principal: AgentPrincipal;
}

@injectable()
export class McpSessionRegistry {
  private readonly sessions = new Map<string, McpSessionEntry>();

  register(sessionId: string, entry: McpSessionEntry): void {
    this.sessions.set(sessionId, entry);
  }

  get(sessionId: string): McpSessionEntry | undefined {
    return this.sessions.get(sessionId);
  }

  remove(sessionId: string): void {
    this.sessions.delete(sessionId);
  }
}
