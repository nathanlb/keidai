function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const DEFAULT_MODEL_ID = "google/gemini-2.5-flash";

export interface DemoConfig {
  toriiMcpUrl: string;
  toriiBearerToken: string;
  ownerEmail: string;
  openRouterApiKey: string;
  modelId: string;
  verbose: boolean;
}

function parseVerboseFlag(): boolean {
  const value = process.env.DEMO_AGENT_VERBOSE?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

export function loadDemoConfig(): DemoConfig {
  return {
    toriiMcpUrl: process.env.TORII_MCP_URL?.trim() ?? "http://127.0.0.1:3100/mcp",
    toriiBearerToken: requiredEnv("DEMO_AGENT_BEARER"),
    ownerEmail: requiredEnv("DEMO_OWNER_EMAIL"),
    openRouterApiKey: requiredEnv("OPEN_ROUTER_API_KEY"),
    modelId: process.env.DEMO_MODEL_ID?.trim() ?? DEFAULT_MODEL_ID,
    verbose: parseVerboseFlag(),
  };
}
