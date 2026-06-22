function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export interface DemoConfig {
  toriiMcpUrl: string;
  toriiBearerToken: string;
  ownerEmail: string;
  anthropicApiKey: string;
  modelId: string;
}

export function loadDemoConfig(): DemoConfig {
  return {
    toriiMcpUrl: process.env.TORII_MCP_URL?.trim() ?? "http://127.0.0.1:3100/mcp",
    toriiBearerToken: requiredEnv("DEMO_AGENT_BEARER"),
    ownerEmail: requiredEnv("DEMO_OWNER_EMAIL"),
    anthropicApiKey: requiredEnv("ANTHROPIC_API_KEY"),
    modelId:
      process.env.DEMO_MODEL_ID?.trim() ?? "claude-sonnet-4-5-20250929",
  };
}
