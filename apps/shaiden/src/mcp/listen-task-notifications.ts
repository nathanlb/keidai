import {
  MCP_SUBSCRIPTIONS_LISTEN_METHOD,
  MCP_TASKS_NOTIFICATION_METHOD,
} from "@keidai/shared";
import {
  iterateSseJson,
  openMcpJsonRpcPost,
} from "@keidai/shared/mcp-jsonrpc";
import {
  MCP_PROTOCOL_VERSION,
  SHAIDEN_CLIENT_CAPABILITIES,
  SHAIDEN_CLIENT_INFO,
} from "./post-mcp-jsonrpc.js";

/**
 * Opt into `notifications/tasks` for one task. Resolves when the stream ends.
 * Failures (including abort) are swallowed — polling remains the source of
 * truth, so a lost listen must never fail the run.
 */
export async function listenForTaskNotifications(input: {
  mcpUrl: string;
  authorization: string;
  taskId: string;
  onWake: () => void;
  signal: AbortSignal;
}): Promise<void> {
  try {
    const { response } = await openMcpJsonRpcPost({
      url: input.mcpUrl,
      method: MCP_SUBSCRIPTIONS_LISTEN_METHOD,
      params: { notifications: { taskIds: [input.taskId] } },
      headers: { Authorization: input.authorization },
      clientInfo: SHAIDEN_CLIENT_INFO,
      clientCapabilities: SHAIDEN_CLIENT_CAPABILITIES,
      protocolVersion: MCP_PROTOCOL_VERSION,
      signal: input.signal,
    });
    const contentType = response.headers.get("content-type") ?? "";
    if (!response.ok || !contentType.includes("text/event-stream")) {
      return;
    }
    for await (const frame of iterateSseJson(response)) {
      if (input.signal.aborted) {
        return;
      }
      if (!isTaskNotificationFor(frame, input.taskId)) {
        continue;
      }
      input.onWake();
    }
  } catch {
    // Dropped stream, JSON-RPC error, or abort: poll continues.
  }
}

function isTaskNotificationFor(frame: unknown, taskId: string): boolean {
  if (!frame || typeof frame !== "object") {
    return false;
  }
  const message = frame as { method?: unknown; params?: unknown };
  if (message.method !== MCP_TASKS_NOTIFICATION_METHOD) {
    return false;
  }
  if (!message.params || typeof message.params !== "object") {
    return false;
  }
  return (message.params as { taskId?: unknown }).taskId === taskId;
}
