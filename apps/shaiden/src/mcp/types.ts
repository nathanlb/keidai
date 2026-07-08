export interface DiscoveredTool {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

export interface ToriiToolCatalog {
  tools: DiscoveredTool[];
  close: () => Promise<void>;
}
