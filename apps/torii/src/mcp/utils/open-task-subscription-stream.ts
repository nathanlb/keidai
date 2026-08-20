import type { FastifyReply, FastifyRequest } from "fastify";
import {
  MCP_SUBSCRIPTIONS_ACKNOWLEDGED_METHOD,
  MCP_SUBSCRIPTION_ID_META_KEY,
  MCP_TASKS_NOTIFICATION_METHOD,
  isMcpTaskTerminalStatus,
} from "@keidai/shared";
import { McpTaskLookupError } from "../../tasks/types/mcp-task.js";
import type { TaskStoreService } from "../../tasks/task-store.service.js";
import type { TaskNotificationBus } from "../../tasks/task-notification-bus.service.js";
import { toDetailedMcpTask } from "../../tasks/utils/to-mcp-task.js";
import { writeMcpSseMessage } from "./write-mcp-sse.js";

const KEEPALIVE_INTERVAL_MS = 15_000;

/**
 * Open a `subscriptions/listen` SSE stream. Notifications are tagged with
 * the listen request id and are not written before the acknowledgement.
 */
export async function openTaskSubscriptionStream(input: {
  request: FastifyRequest;
  reply: FastifyReply;
  requestId: string | number;
  agentId: string;
  coveredTaskIds: readonly string[];
  taskStore: TaskStoreService;
  taskNotifications: TaskNotificationBus;
}): Promise<void> {
  const { reply, request, requestId, agentId, coveredTaskIds } = input;
  const meta = { [MCP_SUBSCRIPTION_ID_META_KEY]: requestId };
  let acknowledged = false;
  const queued = new Set<string>();

  reply.hijack();
  request.raw.setTimeout(0);
  reply.raw.setTimeout(0);
  reply.raw.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  reply.raw.flushHeaders();
  reply.raw.write(": connected\n\n");

  const writeNotification = (
    method: string,
    params: Record<string, unknown>,
  ): boolean => {
    return writeMcpSseMessage(reply.raw, {
      jsonrpc: "2.0",
      method,
      params: { ...params, _meta: meta },
    });
  };

  const pushTask = async (taskId: string, onlyTerminal: boolean): Promise<void> => {
    try {
      const record = await input.taskStore.requireOwnedTask(agentId, taskId);
      if (onlyTerminal && !isMcpTaskTerminalStatus(record.status)) {
        return;
      }
      const detailed = toDetailedMcpTask(record);
      writeNotification(MCP_TASKS_NOTIFICATION_METHOD, { ...detailed });
    } catch (error) {
      if (error instanceof McpTaskLookupError) {
        return;
      }
      throw error;
    }
  };

  const onTaskId = (taskId: string): void => {
    if (!acknowledged) {
      queued.add(taskId);
      return;
    }
    void pushTask(taskId, false);
  };

  const unsubscribe = await input.taskNotifications.subscribe(
    new Set(coveredTaskIds),
    onTaskId,
  );

  const keepalive = setInterval(() => {
    if (!reply.raw.writableEnded) {
      reply.raw.write(": keepalive\n\n");
    }
  }, KEEPALIVE_INTERVAL_MS);
  keepalive.unref();

  let tornDown = false;
  const tearDown = (): void => {
    if (tornDown) {
      return;
    }
    tornDown = true;
    clearInterval(keepalive);
    unsubscribe();
  };

  writeNotification(
    MCP_SUBSCRIPTIONS_ACKNOWLEDGED_METHOD,
    coveredTaskIds.length > 0
      ? { notifications: { taskIds: [...coveredTaskIds] } }
      : { notifications: {} },
  );
  acknowledged = true;

  for (const taskId of queued) {
    void pushTask(taskId, false);
  }
  for (const taskId of coveredTaskIds) {
    void pushTask(taskId, true);
  }

  await new Promise<void>((resolve) => {
    const finish = (): void => {
      tearDown();
      resolve();
    };
    request.raw.on("close", finish);
    reply.raw.on("close", finish);
    reply.raw.on("error", finish);
  });
}
