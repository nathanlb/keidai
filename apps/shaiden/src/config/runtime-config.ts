function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const DEFAULT_AGENT_ID = "shaiden-newsletter-01";
const DEFAULT_MODEL_ID = "google/gemini-2.5-flash";
const DEFAULT_HTTP_PORT = 3200;

export interface RuntimeConfig {
  agentId: string;
  toriiMcpUrl: string;
  bearerToken: string;
  openRouterApiKey: string;
  modelId: string;
  httpHost: string;
  httpPort: number;
}

export function loadRuntimeConfig(): RuntimeConfig {
  const rawPort = process.env.SHAIDEN_PORT?.trim() ?? String(DEFAULT_HTTP_PORT);
  const httpPort = Number(rawPort);
  if (!Number.isFinite(httpPort) || httpPort <= 0) {
    throw new Error(`Invalid SHAIDEN_PORT: ${rawPort}`);
  }

  return {
    agentId: process.env.SHAIDEN_AGENT_ID?.trim() ?? DEFAULT_AGENT_ID,
    toriiMcpUrl:
      process.env.TORII_MCP_URL?.trim() ?? "http://127.0.0.1:3100/mcp",
    bearerToken: requiredEnv("SHAIDEN_BEARER"),
    openRouterApiKey: requiredEnv("OPEN_ROUTER_API_KEY"),
    modelId: process.env.SHAIDEN_MODEL_ID?.trim() ?? DEFAULT_MODEL_ID,
    httpHost: process.env.SHAIDEN_HOST?.trim() ?? "127.0.0.1",
    httpPort,
  };
}
