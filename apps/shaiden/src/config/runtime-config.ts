function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const DEFAULT_MODEL_ID = "google/gemini-2.5-flash";
const DEFAULT_HTTP_PORT = 3200;

export interface RuntimeConfig {
  toriiMcpUrl: string;
  /**
   * Subject token for Fuda token exchange (static secret in v0). When
   * `fudaBaseUrl` is unset (eval/tests), this value is presented to Torii directly.
   */
  bearerToken: string;
  /**
   * Fuda base URL for `POST /token`. Required via `loadRuntimeConfig` /
   * `FUDA_URL`; optional on the type so evals can omit minting.
   */
  fudaBaseUrl?: string;
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
    toriiMcpUrl:
      process.env.TORII_MCP_URL?.trim() ?? "http://127.0.0.1:3100/mcp",
    bearerToken: requiredEnv("SHAIDEN_BEARER"),
    fudaBaseUrl: requiredEnv("FUDA_URL"),
    openRouterApiKey: requiredEnv("OPEN_ROUTER_API_KEY"),
    modelId: process.env.SHAIDEN_MODEL_ID?.trim() ?? DEFAULT_MODEL_ID,
    httpHost: process.env.SHAIDEN_HOST?.trim() ?? "127.0.0.1",
    httpPort,
  };
}
