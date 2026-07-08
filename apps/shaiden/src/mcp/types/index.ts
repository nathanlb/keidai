export interface DiscoveredTool {
    name: string;
    description?: string;
    inputSchema?: Record<string, unknown>;
  }
  
  /** Result of dispatching one tool call to Torii, flattened for the model. */
  export interface ToolCallResult {
    isError: boolean;
    text: string;
  }
  
  export interface ToriiSession {
    tools: DiscoveredTool[];
    callTool: (
      name: string,
      args: Record<string, unknown>,
    ) => Promise<ToolCallResult>;
    close: () => Promise<void>;
  }
  