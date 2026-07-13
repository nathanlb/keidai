export interface GatewayHttpServerHandle {
  /** Base URL for REST endpoints, e.g. http://127.0.0.1:3100 */
  baseUrl: string;
  /** MCP Streamable HTTP endpoint */
  mcpUrl: string;
  /** Alias for mcpUrl — existing MCP clients and tests use this. */
  url: string;
  close(): Promise<void>;
}

export interface GatewayHttpServerOptions {
  host?: string;
  port?: number;
}
