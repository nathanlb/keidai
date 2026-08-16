import type {
  McpInputRequests,
  McpTaskStatus,
} from "@keidai/shared";

export const DEFAULT_MCP_TASK_TTL_MS = 24 * 60 * 60 * 1000;
export const DEFAULT_MCP_TASK_POLL_INTERVAL_MS = 5000;
export const MCP_TASK_ID_BYTES = 32;

export class McpTaskLookupError extends Error {
  readonly code = "mcp_task_lookup" as const;

  constructor(readonly reason: "not_found" | "expired") {
    super(
      reason === "expired"
        ? "Failed to retrieve task: Task has expired"
        : "Failed to retrieve task: Task not found",
    );
    this.name = "McpTaskLookupError";
  }
}

export interface StoredMcpTask {
  taskId: string;
  agentId: string;
  ownerId: string;
  requestMethod: string;
  status: McpTaskStatus;
  statusMessage?: string;
  createdAtMs: number;
  lastUpdatedAtMs: number;
  ttlMs: number | null;
  pollIntervalMs?: number;
  inputRequests?: McpInputRequests;
  satisfiedInputKeys: string[];
  result?: Record<string, unknown>;
  error?: Record<string, unknown>;
  /** Backend that minted the origin task, when this row is a reminted handle. */
  backendServer?: string;
  /** Backend task id. Torii never echoes this as the agent-facing taskId. */
  backendTaskId?: string;
}

export interface CreateMcpTaskInput {
  agentId: string;
  ownerId: string;
  requestMethod?: string;
  statusMessage?: string;
  ttlMs?: number | null;
  pollIntervalMs?: number;
  now?: number;
}
