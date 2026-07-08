function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const DEFAULT_AGENT_ID = "shaiden-newsletter-01";

export interface RuntimeConfig {
  agentId: string;
  toriiMcpUrl: string;
  bearerToken: string;
}

export function loadRuntimeConfig(): RuntimeConfig {
  return {
    agentId: process.env.SHAIDEN_AGENT_ID?.trim() ?? DEFAULT_AGENT_ID,
    toriiMcpUrl:
      process.env.TORII_MCP_URL?.trim() ?? "http://127.0.0.1:3100/mcp",
    bearerToken: requiredEnv("SHAIDEN_BEARER"),
  };
}
