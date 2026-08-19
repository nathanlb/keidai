import { randomUUID } from "node:crypto";
import {
  withTransaction,
  type Pool,
  type PoolClient,
  type Queryable,
} from "@keidai/postgres";
import type {
  AgentPrincipal,
  ApprovalRecordStatus,
  ApprovalRecordView,
} from "@keidai/shared";
import { injectable } from "tsyringe";
import {
  parseJsonValue,
  toEpochMs,
} from "../storage/pg-values.js";
import {
  resolveQueryable,
  runWithQueryable,
} from "../storage/queryable-context.js";
import {
  DEFAULT_APPROVAL_LIST_LIMIT,
  MAX_APPROVAL_LIST_LIMIT,
} from "./types/approval-list.js";

const DEFAULT_APPROVAL_TTL_MS = 24 * 60 * 60 * 1000;
const REJECTION_SUPPRESSION_TTL_MS = 60 * 60 * 1000;

const APPROVAL_SELECT = `
  id,
  agent_id,
  owner_id,
  tool_name,
  params,
  params_hash,
  run_id,
  step_id,
  task_id,
  status,
  rejection_reason,
  created_at,
  expires_at,
  decided_at,
  used_at
`;

export interface ApprovalRecord {
  id: string;
  agentId: string;
  ownerId: string;
  toolName: string;
  params: Record<string, unknown>;
  paramsHash: string;
  /** Opaque correlation ref — Torii stores and echoes only. */
  runId?: string;
  /** Opaque correlation ref — Torii stores and echoes only. */
  stepId?: string;
  taskId?: string;
  status: ApprovalRecordStatus;
  rejectionReason?: string;
  createdAt: number;
  expiresAt: number;
  decidedAt?: number;
  usedAt?: number;
}

export interface RejectedParamsEntry {
  agentId: string;
  toolName: string;
  paramsHash: string;
  rejectionReason?: string;
  rejectedAt: number;
}

interface ApprovalRow {
  id: string;
  agent_id: string;
  owner_id: string;
  tool_name: string;
  params: Record<string, unknown> | string;
  params_hash: string;
  run_id: string | null;
  step_id: string | null;
  task_id: string | null;
  status: ApprovalRecordStatus;
  rejection_reason: string | null;
  created_at: number | string;
  expires_at: number | string;
  decided_at: number | string | null;
  used_at: number | string | null;
}

interface RejectionRow {
  agent_id: string;
  tool_name: string;
  params_hash: string;
  rejection_reason: string | null;
  rejected_at: number | string;
}

@injectable()
export class ApprovalStoreService {
  constructor(private readonly pool: Pool) {}

  private get queryable(): Queryable {
    return resolveQueryable(this.pool);
  }

  async createPendingApproval(input: {
    principal: AgentPrincipal;
    toolName: string;
    params: Record<string, unknown>;
    paramsHash: string;
    runId?: string;
    stepId?: string;
    taskId?: string;
    now?: number;
    ttlMs?: number;
  }): Promise<ApprovalRecord> {
    const now = input.now ?? Date.now();
    const record: ApprovalRecord = {
      id: randomUUID(),
      agentId: input.principal.agentId,
      ownerId: input.principal.ownerId,
      toolName: input.toolName,
      params: input.params,
      paramsHash: input.paramsHash,
      runId: input.runId,
      stepId: input.stepId,
      taskId: input.taskId,
      status: "pending",
      createdAt: now,
      expiresAt: now + (input.ttlMs ?? DEFAULT_APPROVAL_TTL_MS),
    };

    await this.queryable.query(
      `
        INSERT INTO approvals (
          id,
          agent_id,
          owner_id,
          tool_name,
          params,
          params_hash,
          run_id,
          step_id,
          task_id,
          status,
          rejection_reason,
          created_at,
          expires_at,
          decided_at,
          used_at
        )
        VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      `,
      [
        record.id,
        record.agentId,
        record.ownerId,
        record.toolName,
        JSON.stringify(record.params),
        record.paramsHash,
        record.runId ?? null,
        record.stepId ?? null,
        record.taskId ?? null,
        record.status,
        null,
        record.createdAt,
        record.expiresAt,
        null,
        null,
      ],
    );
    return record;
  }

  async getApproval(id: string): Promise<ApprovalRecord | undefined> {
    const result = await this.queryable.query<ApprovalRow>(
      `
        SELECT ${APPROVAL_SELECT}
        FROM approvals
        WHERE id = $1
      `,
      [id],
    );
    const row = result.rows[0];
    return row ? rowToApproval(row) : undefined;
  }

  async getApprovalByTaskId(taskId: string): Promise<ApprovalRecord | undefined> {
    const result = await this.queryable.query<ApprovalRow>(
      `
        SELECT ${APPROVAL_SELECT}
        FROM approvals
        WHERE task_id = $1
      `,
      [taskId],
    );
    const row = result.rows[0];
    return row ? rowToApproval(row) : undefined;
  }

  async runInTransaction<T>(
    fn: (client?: PoolClient) => Promise<T>,
  ): Promise<T> {
    return withTransaction(this.pool, async (client) =>
      runWithQueryable(client, () => fn(client)),
    );
  }

  async listApprovals(
    status?: ApprovalRecordStatus,
    limit = DEFAULT_APPROVAL_LIST_LIMIT,
  ): Promise<ApprovalRecordView[]> {
    const boundedLimit = Math.min(
      Math.max(1, limit),
      MAX_APPROVAL_LIST_LIMIT,
    );
    const result = status
      ? await this.queryable.query<ApprovalRow>(
          `
            SELECT ${APPROVAL_SELECT}
            FROM approvals
            WHERE status = $1
            ORDER BY created_at DESC
            LIMIT $2
          `,
          [status, boundedLimit],
        )
      : await this.queryable.query<ApprovalRow>(
          `
            SELECT ${APPROVAL_SELECT}
            FROM approvals
            ORDER BY created_at DESC
            LIMIT $1
          `,
          [boundedLimit],
        );

    return result.rows.map((row) => toApprovalView(rowToApproval(row)));
  }

  async approve(id: string, now = Date.now()): Promise<ApprovalRecord | undefined> {
    return this.decidePending(id, "approved", undefined, now);
  }

  async reject(
    id: string,
    reason: string | undefined,
    now = Date.now(),
  ): Promise<ApprovalRecord | undefined> {
    const record = await this.decidePending(id, "rejected", reason, now);
    if (!record) {
      return undefined;
    }

    await this.queryable.query(
      `
        INSERT INTO approval_rejections (
          agent_id,
          tool_name,
          params_hash,
          rejection_reason,
          rejected_at
        )
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (agent_id, tool_name, params_hash) DO UPDATE SET
          rejection_reason = excluded.rejection_reason,
          rejected_at = excluded.rejected_at
      `,
      [record.agentId, record.toolName, record.paramsHash, reason ?? null, now],
    );
    await this.pruneRejections(now);
    return record;
  }

  async cancel(id: string, now = Date.now()): Promise<ApprovalRecord | undefined> {
    return this.decidePending(id, "cancelled", undefined, now);
  }

  async markUsed(id: string, now = Date.now()): Promise<ApprovalRecord | undefined> {
    const result = await this.queryable.query(
      `
        UPDATE approvals
        SET used_at = $1
        WHERE id = $2
          AND used_at IS NULL
      `,
      [now, id],
    );
    if ((result.rowCount ?? 0) === 0) {
      return undefined;
    }
    return this.getApproval(id);
  }

  async findRecentRejection(input: {
    agentId: string;
    toolName: string;
    paramsHash: string;
    now?: number;
  }): Promise<RejectedParamsEntry | undefined> {
    const now = input.now ?? Date.now();
    await this.pruneRejections(now);

    const result = await this.queryable.query<RejectionRow>(
      `
        SELECT
          agent_id,
          tool_name,
          params_hash,
          rejection_reason,
          rejected_at
        FROM approval_rejections
        WHERE agent_id = $1
          AND tool_name = $2
          AND params_hash = $3
          AND rejected_at >= $4
      `,
      [input.agentId, input.toolName, input.paramsHash, now - REJECTION_SUPPRESSION_TTL_MS],
    );
    const row = result.rows[0];
    if (!row) {
      return undefined;
    }

    return {
      agentId: row.agent_id,
      toolName: row.tool_name,
      paramsHash: row.params_hash,
      ...(row.rejection_reason !== null
        ? { rejectionReason: row.rejection_reason }
        : {}),
      rejectedAt: toEpochMs(row.rejected_at),
    };
  }

  private async decidePending(
    id: string,
    status: Extract<
      ApprovalRecordStatus,
      "approved" | "rejected" | "cancelled"
    >,
    rejectionReason: string | undefined,
    now: number,
  ): Promise<ApprovalRecord | undefined> {
    const result = await this.queryable.query(
      `
        UPDATE approvals
        SET
          status = $1,
          rejection_reason = $2,
          decided_at = $3
        WHERE id = $4
          AND status = 'pending'
          AND expires_at > $5
      `,
      [
        status,
        status === "rejected" ? (rejectionReason ?? null) : null,
        now,
        id,
        now,
      ],
    );
    if ((result.rowCount ?? 0) === 0) {
      return undefined;
    }
    return this.getApproval(id);
  }

  private async pruneRejections(now: number): Promise<void> {
    await this.queryable.query(
      `DELETE FROM approval_rejections WHERE rejected_at < $1`,
      [now - REJECTION_SUPPRESSION_TTL_MS],
    );
  }
}

function rowToApproval(row: ApprovalRow): ApprovalRecord {
  return {
    id: row.id,
    agentId: row.agent_id,
    ownerId: row.owner_id,
    toolName: row.tool_name,
    params: parseJsonValue(row.params),
    paramsHash: row.params_hash,
    ...(row.run_id !== null ? { runId: row.run_id } : {}),
    ...(row.step_id !== null ? { stepId: row.step_id } : {}),
    ...(row.task_id !== null ? { taskId: row.task_id } : {}),
    status: row.status,
    ...(row.rejection_reason !== null
      ? { rejectionReason: row.rejection_reason }
      : {}),
    createdAt: toEpochMs(row.created_at),
    expiresAt: toEpochMs(row.expires_at),
    ...(row.decided_at !== null ? { decidedAt: toEpochMs(row.decided_at) } : {}),
    ...(row.used_at !== null ? { usedAt: toEpochMs(row.used_at) } : {}),
  };
}

function toApprovalView(record: ApprovalRecord): ApprovalRecordView {
  return {
    id: record.id,
    agentId: record.agentId,
    ownerId: record.ownerId,
    toolName: record.toolName,
    params: record.params,
    runId: record.runId,
    stepId: record.stepId,
    status: record.status,
    rejectionReason: record.rejectionReason,
    createdAt: new Date(record.createdAt).toISOString(),
    expiresAt: new Date(record.expiresAt).toISOString(),
    decidedAt:
      record.decidedAt === undefined
        ? undefined
        : new Date(record.decidedAt).toISOString(),
  };
}
