import { randomBytes } from "node:crypto";
import { MCP_TASK_ID_BYTES } from "../types/mcp-task.js";

/** Unguessable task ID: 256 bits from a CSPRNG, hex-encoded. */
export function generateMcpTaskId(): string {
  return randomBytes(MCP_TASK_ID_BYTES).toString("hex");
}
