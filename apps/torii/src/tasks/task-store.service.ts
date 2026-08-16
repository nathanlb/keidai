import type { DatabaseSync } from "node:sqlite";
import {
  isMcpTaskTerminalStatus,
  type McpDetailedTask,
  type McpInputRequests,
  type McpInputResponses,
  type McpTask,
  type McpTaskStatus,
} from "@keidai/shared";
import { injectable } from "tsyringe";
import {
  DEFAULT_MCP_TASK_POLL_INTERVAL_MS,
  DEFAULT_MCP_TASK_TTL_MS,
  McpTaskLookupError,
  type CreateMcpTaskInput,
  type StoredMcpTask,
} from "./types/mcp-task.js";
import { generateMcpTaskId } from "./utils/generate-mcp-task-id.js";
import {
  isMcpTaskExpired,
  toDetailedMcpTask,
  toMcpTask,
} from "./utils/to-mcp-task.js";

const DEFAULT_REQUEST_METHOD = "tools/call";

interface McpTaskRow {
  task_id: string;
  agent_id: string;
  owner_id: string;
  request_method: string;
  status: McpTaskStatus;
  status_message: string | null;
  created_at: number;
  last_updated_at: number;
  ttl_ms: number | null;
  poll_interval_ms: number | null;
  input_requests: string | null;
  satisfied_input_keys: string;
  result: string | null;
  error: string | null;
  backend_server: string | null;
  backend_task_id: string | null;
}

@injectable()
export class TaskStoreService {
  private readonly insertStatement;
  private readonly getStatement;
  private readonly updateStatement;

  constructor(private readonly db: DatabaseSync) {
    this.insertStatement = db.prepare(`
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
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    this.getStatement = db.prepare(`
      SELECT
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
      FROM mcp_tasks
      WHERE task_id = ?
    `);
    this.updateStatement = db.prepare(`
      UPDATE mcp_tasks
      SET
        status = ?,
        status_message = ?,
        last_updated_at = ?,
        poll_interval_ms = ?,
        input_requests = ?,
        satisfied_input_keys = ?,
        result = ?,
        error = ?,
        backend_server = ?,
        backend_task_id = ?
      WHERE task_id = ?
    `);
  }

  /**
   * Persist a working task, then return the wire `Task`. Callers MUST NOT
   * emit `CreateTaskResult` until this returns.
   */
  createWorkingTask(input: CreateMcpTaskInput): McpTask {
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

    this.insertStatement.run(
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
    );

    return toMcpTask(record);
  }

  getDetailedTask(
    agentId: string,
    taskId: string,
    now = Date.now(),
  ): McpDetailedTask {
    return toDetailedMcpTask(this.requireOwnedTask(agentId, taskId, now));
  }

  /**
   * The stored task, including terminal ones and the backend-origin fields the
   * wire types omit. Throws `McpTaskLookupError` when the task is unknown,
   * owned by another agent, or past its TTL — an agent must not be able to
   * tell those apart.
   */
  requireOwnedTask(
    agentId: string,
    taskId: string,
    now = Date.now(),
  ): StoredMcpTask {
    const record = this.getRecord(taskId);
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
  attachBackendOrigin(
    taskId: string,
    origin: {
      server: string;
      backendTaskId: string;
      pollIntervalMs?: number;
      statusMessage?: string;
    },
    now = Date.now(),
  ): StoredMcpTask | undefined {
    const record = this.getRecord(taskId);
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
    this.save(next);
    return next;
  }

  /**
   * Empty acknowledgement. Unknown or already-satisfied `inputResponses`
   * keys are ignored. When every outstanding key is satisfied the task
   * returns to `working`.
   */
  applyInputResponses(
    agentId: string,
    taskId: string,
    inputResponses: McpInputResponses,
    now = Date.now(),
  ): void {
    const record = this.requireOwnedTask(agentId, taskId, now);
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
    this.save({
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
  requestCancel(agentId: string, taskId: string, now = Date.now()): void {
    const record = this.requireOwnedTask(agentId, taskId, now);
    if (isMcpTaskTerminalStatus(record.status)) {
      return;
    }
    this.save({
      ...record,
      status: "cancelled",
      inputRequests: undefined,
      lastUpdatedAtMs: now,
    });
  }

  requireInput(
    taskId: string,
    inputRequests: McpInputRequests,
    now = Date.now(),
  ): StoredMcpTask | undefined {
    const record = this.getRecord(taskId);
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
    this.save(next);
    return next;
  }

  /**
   * Mark the task completed with the original request's result.
   * A tool result with `isError: true` is still `completed`.
   */
  complete(
    taskId: string,
    result: Record<string, unknown>,
    now = Date.now(),
  ): StoredMcpTask | undefined {
    return this.finish(taskId, "completed", { result }, now);
  }

  /**
   * Mark the task failed with a JSON-RPC error. Do not use for tool-level
   * `isError: true` results.
   */
  fail(
    taskId: string,
    error: Record<string, unknown>,
    now = Date.now(),
  ): StoredMcpTask | undefined {
    return this.finish(taskId, "failed", { error }, now);
  }

  private finish(
    taskId: string,
    status: "completed" | "failed",
    payload: { result?: Record<string, unknown>; error?: Record<string, unknown> },
    now: number,
  ): StoredMcpTask | undefined {
    const record = this.getRecord(taskId);
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
    this.save(next);
    return next;
  }

  private getRecord(taskId: string): StoredMcpTask | undefined {
    const row = this.getStatement.get(taskId) as McpTaskRow | undefined;
    return row ? rowToRecord(row) : undefined;
  }

  private save(record: StoredMcpTask): void {
    this.updateStatement.run(
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
    createdAtMs: row.created_at,
    lastUpdatedAtMs: row.last_updated_at,
    ttlMs: row.ttl_ms,
    ...(row.poll_interval_ms !== null
      ? { pollIntervalMs: row.poll_interval_ms }
      : {}),
    ...(row.input_requests !== null
      ? { inputRequests: JSON.parse(row.input_requests) as McpInputRequests }
      : {}),
    satisfiedInputKeys: JSON.parse(row.satisfied_input_keys) as string[],
    ...(row.result !== null
      ? { result: JSON.parse(row.result) as Record<string, unknown> }
      : {}),
    ...(row.error !== null
      ? { error: JSON.parse(row.error) as Record<string, unknown> }
      : {}),
    ...(row.backend_server !== null ? { backendServer: row.backend_server } : {}),
    ...(row.backend_task_id !== null ? { backendTaskId: row.backend_task_id } : {}),
  };
}
