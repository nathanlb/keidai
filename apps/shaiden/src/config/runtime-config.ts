function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const DEFAULT_AGENT_ID = "shaiden-newsletter-01";
const DEFAULT_MODEL_ID = "google/gemini-2.5-flash";

export interface RuntimeConfig {
  agentId: string;
  toriiMcpUrl: string;
  bearerToken: string;
  openRouterApiKey: string;
  modelId: string;
}

export function loadRuntimeConfig(): RuntimeConfig {
  return {
    agentId: process.env.SHAIDEN_AGENT_ID?.trim() ?? DEFAULT_AGENT_ID,
    toriiMcpUrl:
      process.env.TORII_MCP_URL?.trim() ?? "http://127.0.0.1:3100/mcp",
    bearerToken: requiredEnv("SHAIDEN_BEARER"),
    openRouterApiKey: requiredEnv("OPEN_ROUTER_API_KEY"),
    modelId: process.env.SHAIDEN_MODEL_ID?.trim() ?? DEFAULT_MODEL_ID,
  };
}
