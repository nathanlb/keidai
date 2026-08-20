import type { Pool, Queryable } from "@keidai/postgres";
import {
  isMcpTaskTerminalStatus,
  type McpDetailedTask,
  type McpInputRequests,
  type McpInputResponses,
  type McpTask,
  type McpTaskStatus,
} from "@keidai/shared";
import { injectable } from "tsyringe";
import { parseJsonValue, toEpochMs } from "../storage/pg-values.js";
import { resolveQueryable } from "../storage/queryable-context.js";
import {
  DEFAULT_MCP_TASK_POLL_INTERVAL_MS,
  DEFAULT_MCP_TASK_TTL_MS,
  McpTaskLookupError,
  type CreateMcpTaskInput,
  type StoredMcpTask,
} from "./types/mcp-task.js";
import { generateMcpTaskId } from "./utils/generate-mcp-task-id.js";
import { MCP_TASK_STATUS_CHANNEL } from "./mcp-task-status-channel.js";
import {
  isMcpTaskExpired,
  toDetailedMcpTask,
  toMcpTask,
} from "./utils/to-mcp-task.js";

const DEFAULT_REQUEST_METHOD = "tools/call";

const TASK_SELECT = `
  task_id,
  agent_id,
  owner_id,
  request_method,
  status,
  status_message,
  created_at,
  last_updated_at,
  ttl_ms,
  poll_interval_ms,
  input_requests,
  satisfied_input_keys,
  result,
  error,
  backend_server,
  backend_task_id
`;

interface McpTaskRow {
  task_id: string;
  agent_id: string;
  owner_id: string;
  request_method: string;
  status: McpTaskStatus;
  status_message: string | null;
  created_at: number | string;
  last_updated_at: number | string;
  ttl_ms: number | null;
  poll_interval_ms: number | null;
  input_requests: McpInputRequests | string | null;
  satisfied_input_keys: string[] | string;
  result: Record<string, unknown> | string | null;
  error: Record<string, unknown> | string | null;
  backend_server: string | null;
  backend_task_id: string | null;
}

@injectable()
export class TaskStoreService {
  constructor(private readonly pool: Pool) {}

  private get queryable(): Queryable {
    return resolveQueryable(this.pool);
  }

  /**
   * Persist a working task, then return the wire `Task`. Callers MUST NOT
   * emit `CreateTaskResult` until this returns.
   */
  async createWorkingTask(input: CreateMcpTaskInput): Promise<McpTask> {
    const now = input.now ?? Date.now();
    const record: StoredMcpTask = {
      taskId: generateMcpTaskId(),
      agentId: input.agentId,
      ownerId: input.ownerId,
      requestMethod: input.requestMethod ?? DEFAULT_REQUEST_METHOD,
      status: "working",
      statusMessage: input.statusMessage,
      createdAtMs: now,
      lastUpdatedAtMs: now,
      ttlMs: input.ttlMs === undefined ? DEFAULT_MCP_TASK_TTL_MS : input.ttlMs,
      pollIntervalMs: input.pollIntervalMs ?? DEFAULT_MCP_TASK_POLL_INTERVAL_MS,
      satisfiedInputKeys: [],
    };

    await this.queryable.query(
      `
        INSERT INTO mcp_tasks (
          task_id,
          agent_id,
          owner_id,
          request_method,
          status,
          status_message,
          created_at,
          last_updated_at,
          ttl_ms,
          poll_interval_ms,
          input_requests,
          satisfied_input_keys,
          result,
          error
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12::jsonb, $13::jsonb, $14::jsonb)
      `,
      [
        record.taskId,
        record.agentId,
        record.ownerId,
        record.requestMethod,
        record.status,
        record.statusMessage ?? null,
        record.createdAtMs,
        record.lastUpdatedAtMs,
        record.ttlMs,
        record.pollIntervalMs ?? null,
        null,
        JSON.stringify(record.satisfiedInputKeys),
        null,
        null,
      ],
    );

    return toMcpTask(record);
  }

  async getDetailedTask(
    agentId: string,
    taskId: string,
    now = Date.now(),
  ): Promise<McpDetailedTask> {
    return toDetailedMcpTask(await this.requireOwnedTask(agentId, taskId, now));
  }

  /**
   * The stored task, including terminal ones and the backend-origin fields the
   * wire types omit. Throws `McpTaskLookupError` when the task is unknown,
   * owned by another agent, or past its TTL — an agent must not be able to
   * tell those apart.
   */
  async requireOwnedTask(
    agentId: string,
    taskId: string,
    now = Date.now(),
  ): Promise<StoredMcpTask> {
    const record = await this.getRecord(taskId);
    if (!record || record.agentId !== agentId) {
      throw new McpTaskLookupError("not_found");
    }
    if (isMcpTaskExpired(record, now)) {
      throw new McpTaskLookupError("expired");
    }
    return record;
  }

  /**
   * Bind a reminted gateway task to a backend-originated task.
   *
   * Returns `undefined` when there is nothing to bind to — the task is unknown,
   * or already terminal because the agent cancelled it while the backend call
   * was in flight. Callers must treat that as a refusal and cancel upstream,
   * otherwise the backend keeps working on a task nobody will read.
   */
  async attachBackendOrigin(
    taskId: string,
    origin: {
      server: string;
      backendTaskId: string;
      pollIntervalMs?: number;
      statusMessage?: string;
    },
    now = Date.now(),
  ): Promise<StoredMcpTask | undefined> {
    const record = await this.getRecord(taskId);
    if (!record || isMcpTaskTerminalStatus(record.status)) {
      return undefined;
    }
    const next: StoredMcpTask = {
      ...record,
      backendServer: origin.server,
      backendTaskId: origin.backendTaskId,
      ...(origin.pollIntervalMs !== undefined
        ? { pollIntervalMs: origin.pollIntervalMs }
        : {}),
      ...(origin.statusMessage !== undefined
        ? { statusMessage: origin.statusMessage }
        : {}),
      lastUpdatedAtMs: now,
    };
    await this.save(next);
    return next;
  }

  /**
   * Empty acknowledgement. Unknown or already-satisfied `inputResponses`
   * keys are ignored. When every outstanding key is satisfied the task
   * returns to `working`.
   */
  async applyInputResponses(
    agentId: string,
    taskId: string,
    inputResponses: McpInputResponses,
    now = Date.now(),
  ): Promise<void> {
    const record = await this.requireOwnedTask(agentId, taskId, now);
    if (record.status !== "input_required") {
      return;
    }

    const outstanding = record.inputRequests ?? {};
    const satisfied = new Set(record.satisfiedInputKeys);
    for (const key of Object.keys(inputResponses)) {
      if (!(key in outstanding) || satisfied.has(key)) {
        continue;
      }
      satisfied.add(key);
      delete outstanding[key];
    }

    const remaining = Object.keys(outstanding);
    await this.saveAndNotify(record.status, {
      ...record,
      status: remaining.length === 0 ? "working" : "input_required",
      inputRequests: remaining.length === 0 ? undefined : outstanding,
      satisfiedInputKeys: [...satisfied],
      lastUpdatedAtMs: now,
    });
  }

  /**
   * Cooperative cancel: acknowledges even if the task is already terminal.
   * Non-terminal tasks move to `cancelled`.
   */
  async requestCancel(agentId: string, taskId: string, now = Date.now()): Promise<void> {
    const record = await this.requireOwnedTask(agentId, taskId, now);
    if (isMcpTaskTerminalStatus(record.status)) {
      return;
    }
    await this.saveAndNotify(record.status, {
      ...record,
      status: "cancelled",
      inputRequests: undefined,
      lastUpdatedAtMs: now,
    });
  }

  async requireInput(
    taskId: string,
    inputRequests: McpInputRequests,
    now = Date.now(),
  ): Promise<StoredMcpTask | undefined> {
    const record = await this.getRecord(taskId);
    if (!record || isMcpTaskTerminalStatus(record.status)) {
      return undefined;
    }
    const satisfied = new Set(record.satisfiedInputKeys);
    for (const key of Object.keys(inputRequests)) {
      if (satisfied.has(key)) {
        throw new Error(
          `inputRequests key '${key}' was already used on task ${taskId}`,
        );
      }
    }
    const next: StoredMcpTask = {
      ...record,
      status: "input_required",
      inputRequests: { ...record.inputRequests, ...inputRequests },
      lastUpdatedAtMs: now,
    };
    await this.saveAndNotify(record.status, next);
    return next;
  }

  /**
   * Mark the task completed with the original request's result.
   * A tool result with `isError: true` is still `completed`.
   */
  async complete(
    taskId: string,
    result: Record<string, unknown>,
    now = Date.now(),
  ): Promise<StoredMcpTask | undefined> {
    return this.finish(taskId, "completed", { result }, now);
  }

  /**
   * Mark the task failed with a JSON-RPC error. Do not use for tool-level
   * `isError: true` results.
   */
  async fail(
    taskId: string,
    error: Record<string, unknown>,
    now = Date.now(),
  ): Promise<StoredMcpTask | undefined> {
    return this.finish(taskId, "failed", { error }, now);
  }

  private async finish(
    taskId: string,
    status: "completed" | "failed",
    payload: { result?: Record<string, unknown>; error?: Record<string, unknown> },
    now: number,
  ): Promise<StoredMcpTask | undefined> {
    const record = await this.getRecord(taskId);
    if (!record || isMcpTaskTerminalStatus(record.status)) {
      return record;
    }
    const next: StoredMcpTask = {
      ...record,
      status,
      result: payload.result,
      error: payload.error,
      inputRequests: undefined,
      lastUpdatedAtMs: now,
    };
    await this.saveAndNotify(record.status, next);
    return next;
  }

  private async getRecord(taskId: string): Promise<StoredMcpTask | undefined> {
    const result = await this.queryable.query<McpTaskRow>(
      `
        SELECT ${TASK_SELECT}
        FROM mcp_tasks
        WHERE task_id = $1
      `,
      [taskId],
    );
    const row = result.rows[0];
    return row ? rowToRecord(row) : undefined;
  }

  private async saveAndNotify(
    previousStatus: McpTaskStatus,
    record: StoredMcpTask,
  ): Promise<void> {
    await this.save(record);
    if (previousStatus !== record.status) {
      await this.notifyStatusChange(record.taskId);
    }
  }

  private async notifyStatusChange(taskId: string): Promise<void> {
    await this.queryable.query("SELECT pg_notify($1, $2)", [
      MCP_TASK_STATUS_CHANNEL,
      taskId,
    ]);
  }

  private async save(record: StoredMcpTask): Promise<void> {
    await this.queryable.query(
      `
        UPDATE mcp_tasks
        SET
          status = $1,
          status_message = $2,
          last_updated_at = $3,
          poll_interval_ms = $4,
          input_requests = $5::jsonb,
          satisfied_input_keys = $6::jsonb,
          result = $7::jsonb,
          error = $8::jsonb,
          backend_server = $9,
          backend_task_id = $10
        WHERE task_id = $11
      `,
      [
        record.status,
        record.statusMessage ?? null,
        record.lastUpdatedAtMs,
        record.pollIntervalMs ?? null,
        record.inputRequests === undefined
          ? null
          : JSON.stringify(record.inputRequests),
        JSON.stringify(record.satisfiedInputKeys),
        record.result === undefined ? null : JSON.stringify(record.result),
        record.error === undefined ? null : JSON.stringify(record.error),
        record.backendServer ?? null,
        record.backendTaskId ?? null,
        record.taskId,
      ],
    );
  }
}

function rowToRecord(row: McpTaskRow): StoredMcpTask {
  return {
    taskId: row.task_id,
    agentId: row.agent_id,
    ownerId: row.owner_id,
    requestMethod: row.request_method,
    status: row.status,
    ...(row.status_message !== null ? { statusMessage: row.status_message } : {}),
    createdAtMs: toEpochMs(row.created_at),
    lastUpdatedAtMs: toEpochMs(row.last_updated_at),
    ttlMs: row.ttl_ms,
    ...(row.poll_interval_ms !== null
      ? { pollIntervalMs: row.poll_interval_ms }
      : {}),
    ...(row.input_requests !== null
      ? { inputRequests: parseJsonValue(row.input_requests) }
      : {}),
    satisfiedInputKeys: parseJsonValue(row.satisfied_input_keys),
    ...(row.result !== null
      ? { result: parseJsonValue(row.result) }
      : {}),
    ...(row.error !== null
      ? { error: parseJsonValue(row.error) }
      : {}),
    ...(row.backend_server !== null ? { backendServer: row.backend_server } : {}),
    ...(row.backend_task_id !== null ? { backendTaskId: row.backend_task_id } : {}),
  };
}
