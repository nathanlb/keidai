import type { ToriiCallMeta } from "@keidai/shared";

export interface DiscoveredTool {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

/** Result of dispatching one tool call to Torii, flattened for the model. */
export interface ToolCallResult {
  isError: boolean;
  text: string;
  approvalRequired?: { approvalId: string; pollIntervalMs?: number };
  approvalDenied?: boolean;
  policyDenied?: boolean;
  /** Out-of-band Torii metadata from MCP `_meta` (never model-facing). */
  meta?: ToriiCallMeta;
}

/** Supplies the Fuda-minted agent JWT presented to Torii. */
export interface ToriiSessionCredential {
  ensureToken: (options?: { force?: boolean }) => Promise<string>;
}

/**
 * Per-run Torii MCP caller: Torii URL + JWT provider, not a held protocol session.
 * Each list/call/poll is a self-contained request. Gated tools return a park
 * handle from `callTool`; `pollMcpTask` reads `tasks/get` until terminal.
 */
export interface ToriiSession {
  tools: DiscoveredTool[];
  callTool: (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<ToolCallResult>;
  pollMcpTask: (
    taskId: string,
    pollIntervalMs?: number,
  ) => Promise<ToolCallResult>;
  close: () => Promise<void>;
}
