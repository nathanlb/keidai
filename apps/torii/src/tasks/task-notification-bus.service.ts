import { createDedicatedClient, type Pool } from "@keidai/postgres";
import { injectable } from "tsyringe";
import { MCP_TASK_STATUS_CHANNEL } from "./mcp-task-status-channel.js";

interface TaskStatusSubscriber {
  taskIds: ReadonlySet<string>;
  listener: (taskId: string) => void;
}

/**
 * Cross-replica fan-out for `notifications/tasks`.
 *
 * Publishers (`TaskStoreService`) NOTIFY on status transitions. Each replica
 * holds one LISTEN connection and delivers matching task IDs to in-process
 * `subscriptions/listen` streams. A lost LISTEN degrades to polling.
 */
@injectable()
export class TaskNotificationBus {
  private client: ReturnType<typeof createDedicatedClient> | null = null;
  private listening: Promise<void> | null = null;
  private closed = false;
  private readonly subscribers = new Set<TaskStatusSubscriber>();

  constructor(private readonly pool: Pool) {}

  /**
   * Register for `taskIds` and wait until LISTEN is active so a subsequent
   * NOTIFY cannot race the subscription.
   */
  async subscribe(
    taskIds: ReadonlySet<string>,
    listener: (taskId: string) => void,
  ): Promise<() => void> {
    if (this.closed) {
      throw new Error("TaskNotificationBus is closed");
    }
    const subscriber: TaskStatusSubscriber = { taskIds, listener };
    this.subscribers.add(subscriber);
    try {
      await this.ensureListening();
    } catch (error) {
      this.subscribers.delete(subscriber);
      throw error;
    }
    return () => {
      this.subscribers.delete(subscriber);
    };
  }

  async close(): Promise<void> {
    this.closed = true;
    this.subscribers.clear();
    await this.releaseClient();
  }

  private async ensureListening(): Promise<void> {
    if (this.client) {
      return;
    }
    this.listening ??= this.startListening().catch((error: unknown) => {
      this.listening = null;
      throw error;
    });
    await this.listening;
  }

  private async startListening(): Promise<void> {
    const client = createDedicatedClient(this.pool);
    client.on("notification", (message) => {
      if (message.channel !== MCP_TASK_STATUS_CHANNEL || !message.payload) {
        return;
      }
      this.dispatch(message.payload);
    });
    client.on("error", () => {
      void this.handleClientError(client);
    });
    await client.connect();
    await client.query(`LISTEN ${MCP_TASK_STATUS_CHANNEL}`);
    if (this.closed) {
      await client.end().catch(() => {});
      return;
    }
    this.client = client;
  }

  private dispatch(taskId: string): void {
    for (const subscriber of this.subscribers) {
      if (subscriber.taskIds.has(taskId)) {
        subscriber.listener(taskId);
      }
    }
  }

  private async handleClientError(
    client: ReturnType<typeof createDedicatedClient>,
  ): Promise<void> {
    if (this.client !== client) {
      return;
    }
    this.client = null;
    try {
      await client.end();
    } catch {
      // Already dropped.
    }
    if (this.closed || this.subscribers.size === 0) {
      return;
    }
    this.listening = this.startListening();
    try {
      await this.listening;
    } catch {
      this.listening = null;
    }
  }

  private async releaseClient(): Promise<void> {
    const client = this.client;
    this.client = null;
    this.listening = null;
    if (!client) {
      return;
    }
    try {
      await client.query(`UNLISTEN ${MCP_TASK_STATUS_CHANNEL}`);
    } catch {
      // Closing anyway.
    }
    await client.end().catch(() => {});
  }
}
