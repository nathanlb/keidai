/** Credential strategy for a backend or tool call. */
export type CredentialStrategy = "obo" | "service_key" | "gateway";

/** Transport type for an MCP backend connection. */
export type TransportType = "stdio" | "http";

/** Static credential binding declared in config. */
export interface CredentialBinding {
  strategy: CredentialStrategy;
  header?: string;
  value?: string;
}

/** Stdio-launched MCP server. */
export interface StdioServerConfig {
  name: string;
  transport: "stdio";
  command: string;
  args?: string[];
  env?: Record<string, string>;
  credentials?: CredentialBinding;
}

/** Remote MCP server over HTTP/SSE. */
export interface HttpServerConfig {
  name: string;
  transport: "http";
  url: string;
  credentials?: CredentialBinding;
}

export type ServerConfig = StdioServerConfig | HttpServerConfig;

export type PolicyAction = "allow" | "deny";

export interface PolicyRule {
  server?: string;
  tools?: string[];
  action: PolicyAction;
}

export interface PolicyConfig {
  default: PolicyAction;
  rules?: PolicyRule[];
}

export type TraceSink = "stdout" | "otel";

export interface TracingConfig {
  sink: TraceSink;
  format?: "json" | "otel";
}

/** Root torii.yaml shape — loaded at boot, no database. */
export interface ToriiConfig {
  servers: ServerConfig[];
  policy?: PolicyConfig;
  tracing?: TracingConfig;
}
