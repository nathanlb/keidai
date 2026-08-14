import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type {
  AgentPrincipal,
  ApprovalRecordStatus,
  ApprovalRecordView,
} from "@keidai/shared";
import { injectable } from "tsyringe";
import { runGatewayTransaction } from "../storage/run-gateway-transaction.js";
import {
  DEFAULT_APPROVAL_LIST_LIMIT,
  MAX_APPROVAL_LIST_LIMIT,
} from "./types/approval-list.js";

const DEFAULT_APPROVAL_TTL_MS = 24 * 60 * 60 * 1000;
const REJECTION_SUPPRESSION_TTL_MS = 60 * 60 * 1000;

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
  params: string;
  params_hash: string;
  run_id: string | null;
  step_id: string | null;
  task_id: string | null;
  status: ApprovalRecordStatus;
  rejection_reason: string | null;
  created_at: number;
  expires_at: number;
  decided_at: number | null;
  used_at: number | null;
}

interface RejectionRow {
  agent_id: string;
  tool_name: string;
  params_hash: string;
  rejection_reason: string | null;
  rejected_at: number;
}

@injectable()
export class ApprovalStoreService {
  private readonly insertApprovalStatement;
  private readonly getApprovalStatement;
  private readonly getApprovalByTaskIdStatement;
  private readonly listApprovalsStatement;
  private readonly listApprovalsByStatusStatement;
  private readonly decidePendingStatement;
  private readonly markUsedStatement;
  private readonly upsertRejectionStatement;
  private readonly findRejectionStatement;
  private readonly pruneRejectionsStatement;

  constructor(private readonly db: DatabaseSync) {
    this.insertApprovalStatement = db.prepare(`
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
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    this.getApprovalStatement = db.prepare(`
      SELECT
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
      FROM approvals
      WHERE id = ?
    `);
    this.getApprovalByTaskIdStatement = db.prepare(`
      SELECT
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
      FROM approvals
      WHERE task_id = ?
    `);
    this.listApprovalsStatement = db.prepare(`
      SELECT
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
      FROM approvals
      ORDER BY created_at DESC
      LIMIT ?
    `);
    this.listApprovalsByStatusStatement = db.prepare(`
      SELECT
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
      FROM approvals
      WHERE status = ?
      ORDER BY created_at DESC
      LIMIT ?
    `);
    this.decidePendingStatement = db.prepare(`
      UPDATE approvals
      SET
        status = ?,
        rejection_reason = ?,
        decided_at = ?
      WHERE id = ?
        AND status = 'pending'
        AND expires_at > ?
    `);
    this.markUsedStatement = db.prepare(`
      UPDATE approvals
      SET used_at = ?
      WHERE id = ?
        AND used_at IS NULL
    `);
    this.upsertRejectionStatement = db.prepare(`
      INSERT INTO approval_rejections (
        agent_id,
        tool_name,
        params_hash,
        rejection_reason,
        rejected_at
      )
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(agent_id, tool_name, params_hash) DO UPDATE SET
        rejection_reason = excluded.rejection_reason,
        rejected_at = excluded.rejected_at
    `);
    this.findRejectionStatement = db.prepare(`
      SELECT
        agent_id,
        tool_name,
        params_hash,
        rejection_reason,
        rejected_at
      FROM approval_rejections
      WHERE agent_id = ?
        AND tool_name = ?
        AND params_hash = ?
        AND rejected_at >= ?
    `);
    this.pruneRejectionsStatement = db.prepare(`
      DELETE FROM approval_rejections
      WHERE rejected_at < ?
    `);
  }

  createPendingApproval(input: {
    principal: AgentPrincipal;
    toolName: string;
    params: Record<string, unknown>;
    paramsHash: string;
    runId?: string;
    stepId?: string;
    taskId?: string;
    now?: number;
    ttlMs?: number;
  }): ApprovalRecord {
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

    this.insertApprovalStatement.run(
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
    );
    return record;
  }

  getApproval(id: string): ApprovalRecord | undefined {
    const row = this.getApprovalStatement.get(id) as ApprovalRow | undefined;
    return row ? rowToApproval(row) : undefined;
  }

  getApprovalByTaskId(taskId: string): ApprovalRecord | undefined {
    const row = this.getApprovalByTaskIdStatement.get(taskId) as
      | ApprovalRow
      | undefined;
    return row ? rowToApproval(row) : undefined;
  }

  runInTransaction<T>(fn: () => T): T {
    return runGatewayTransaction(this.db, fn);
  }

  listApprovals(
    status?: ApprovalRecordStatus,
    limit = DEFAULT_APPROVAL_LIST_LIMIT,
  ): ApprovalRecordView[] {
    const boundedLimit = Math.min(
      Math.max(1, limit),
      MAX_APPROVAL_LIST_LIMIT,
    );
    const rows = (
      status
        ? this.listApprovalsByStatusStatement.all(status, boundedLimit)
        : this.listApprovalsStatement.all(boundedLimit)
    ) as unknown as ApprovalRow[];

    return rows.map((row) => toApprovalView(rowToApproval(row)));
  }

  approve(id: string, now = Date.now()): ApprovalRecord | undefined {
    return this.decidePending(id, "approved", undefined, now);
  }

  reject(
    id: string,
    reason: string | undefined,
    now = Date.now(),
  ): ApprovalRecord | undefined {
    const record = this.decidePending(id, "rejected", reason, now);
    if (!record) {
      return undefined;
    }

    this.upsertRejectionStatement.run(
      record.agentId,
      record.toolName,
      record.paramsHash,
      reason ?? null,
      now,
    );
    this.pruneRejections(now);
    return record;
  }

  cancel(id: string, now = Date.now()): ApprovalRecord | undefined {
    return this.decidePending(id, "cancelled", undefined, now);
  }

  markUsed(id: string, now = Date.now()): ApprovalRecord | undefined {
    const result = this.markUsedStatement.run(now, id);
    if ((result.changes ?? 0) === 0) {
      return undefined;
    }
    return this.getApproval(id);
  }

  findRecentRejection(input: {
    agentId: string;
    toolName: string;
    paramsHash: string;
    now?: number;
  }): RejectedParamsEntry | undefined {
    const now = input.now ?? Date.now();
    this.pruneRejections(now);

    const row = this.findRejectionStatement.get(
      input.agentId,
      input.toolName,
      input.paramsHash,
      now - REJECTION_SUPPRESSION_TTL_MS,
    ) as RejectionRow | undefined;

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
      rejectedAt: row.rejected_at,
    };
  }

  private decidePending(
    id: string,
    status: Extract<
      ApprovalRecordStatus,
      "approved" | "rejected" | "cancelled"
    >,
    rejectionReason: string | undefined,
    now: number,
  ): ApprovalRecord | undefined {
    const result = this.decidePendingStatement.run(
      status,
      status === "rejected" ? (rejectionReason ?? null) : null,
      now,
      id,
      now,
    );
    if ((result.changes ?? 0) === 0) {
      return undefined;
    }
    return this.getApproval(id);
  }

  private pruneRejections(now: number): void {
    this.pruneRejectionsStatement.run(now - REJECTION_SUPPRESSION_TTL_MS);
  }
}

function rowToApproval(row: ApprovalRow): ApprovalRecord {
  return {
    id: row.id,
    agentId: row.agent_id,
    ownerId: row.owner_id,
    toolName: row.tool_name,
    params: JSON.parse(row.params) as Record<string, unknown>,
    paramsHash: row.params_hash,
    ...(row.run_id !== null ? { runId: row.run_id } : {}),
    ...(row.step_id !== null ? { stepId: row.step_id } : {}),
    ...(row.task_id !== null ? { taskId: row.task_id } : {}),
    status: row.status,
    ...(row.rejection_reason !== null
      ? { rejectionReason: row.rejection_reason }
      : {}),
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    ...(row.decided_at !== null ? { decidedAt: row.decided_at } : {}),
    ...(row.used_at !== null ? { usedAt: row.used_at } : {}),
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
