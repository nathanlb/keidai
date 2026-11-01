import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createIsolatedSchema,
  defaultPartitionRetentionMs,
  resolveTestDatabaseUrl,
  toIso,
  type IsolatedSchema,
  type Pool,
} from "@keidai/postgres";
import type { Logger, Task } from "@keidai/shared";
import { attemptRetentionMs } from "../attempt-retention.js";
import { backfillRunAttempts } from "../backfill-run-attempts.js";
import { PgRunRepository } from "../pg-run-repository.js";
import { taskRevisionHash } from "../task-revision-hash.js";
import { createRunStep } from "../utils/create-run-step.js";
import { openShaidenDatabase } from "../../storage/shaiden-postgres.js";

const sampleTask: Task = {
  goal: "Compose and send the keidai status newsletter.",
  trigger: { type: "now" },
  assignee: "shaiden-newsletter-01",
  limits: { max_iterations: 5, timeout_seconds: 60 },
  modelId: "openai/gpt-4.1-mini",
};

interface StoredAttempt {
  runId: string;
  attemptIndex: number;
  kind: string;
  taskId: string;
  agentId: string;
  agentOwnerId: string | null;
  modelId: string | null;
  personaVersion: number | null;
  taskRevisionHash: string;
  maxIterations: number | null;
  timeoutSeconds: number | null;
  startedAt: string;
  endedAt: string;
  activeMs: number;
  iterationsUsed: number;
  outcome: string;
  outcomeReason: string | null;
  toolCounts: Record<string, { calls: number; errors: number }>;
  approvalRequestCount: number;
  rejectionCount: number;
  backfilled: boolean;
}

async function createSchema(): Promise<IsolatedSchema> {
  const isolated = await createIsolatedSchema();
  await openShaidenDatabase(resolveTestDatabaseUrl(), isolated.pool);
  return isolated;
}

async function seedTask(pool: Pool, taskId = "task-1"): Promise<void> {
  await pool.query(
    `
      INSERT INTO tasks (
        id, goal, trigger_json, assignee, limits_json, created_at, updated_at
      ) VALUES ($1, $2, $3::jsonb, $4, $5::jsonb, $6, $7)
    `,
    [
      taskId,
      sampleTask.goal,
      JSON.stringify(sampleTask.trigger),
      sampleTask.assignee,
      JSON.stringify(sampleTask.limits),
      "2026-07-08T12:00:00.000Z",
      "2026-07-08T12:00:00.000Z",
    ],
  );
}

function asCount(value: string | number | null): number {
  return Number(value ?? 0);
}

async function readAttempts(
  pool: Pool,
  runId: string,
): Promise<StoredAttempt[]> {
  const result = await pool.query<{
    run_id: string;
    attempt_index: number;
    kind: string;
    task_id: string;
    agent_id: string;
    agent_owner_id: string | null;
    model_id: string | null;
    persona_version: number | null;
    task_revision_hash: string;
    max_iterations: number | null;
    timeout_seconds: number | null;
    started_at: Date | string;
    ended_at: Date | string;
    active_ms: string | number;
    iterations_used: number;
    outcome: string;
    outcome_reason: string | null;
    tool_counts_json: Record<string, { calls: number; errors: number }>;
    approval_request_count: number;
    rejection_count: number;
    backfilled: boolean;
  }>(
    `
      SELECT run_id, attempt_index, kind, task_id, agent_id, agent_owner_id,
             model_id, persona_version, task_revision_hash,
             max_iterations, timeout_seconds, started_at, ended_at,
             active_ms, iterations_used, outcome, outcome_reason,
             tool_counts_json, approval_request_count, rejection_count, backfilled
      FROM run_attempts
      WHERE run_id = $1
      ORDER BY attempt_index ASC
    `,
    [runId],
  );
  return result.rows.map((row) => ({
    runId: row.run_id,
    attemptIndex: row.attempt_index,
    kind: row.kind,
    taskId: row.task_id,
    agentId: row.agent_id,
    agentOwnerId: row.agent_owner_id,
    modelId: row.model_id,
    personaVersion: row.persona_version,
    taskRevisionHash: row.task_revision_hash,
    maxIterations: row.max_iterations,
    timeoutSeconds: row.timeout_seconds,
    startedAt: toIso(row.started_at),
    endedAt: toIso(row.ended_at),
    activeMs: asCount(row.active_ms),
    iterationsUsed: row.iterations_used,
    outcome: row.outcome,
    outcomeReason: row.outcome_reason,
    toolCounts: row.tool_counts_json,
    approvalRequestCount: row.approval_request_count,
    rejectionCount: row.rejection_count,
    backfilled: row.backfilled,
  }));
}

async function rememberHistory(repository: PgRunRepository): Promise<void> {
  await repository.setConversationHistory("run-1", [
    { role: "user", text: sampleTask.goal },
    { role: "assistant", text: "partial", toolCalls: [] },
  ]);
}

describe("run attempt facts", () => {
  it("records per-attempt iterations and duration across two follow-ups", async () => {
    const isolated = await createSchema();
    try {
      await seedTask(isolated.pool);
      const repository = new PgRunRepository(isolated.pool);
      await repository.create({
        id: "run-1",
        taskId: "task-1",
        task: sampleTask,
        assignee: sampleTask.assignee,
        goal: sampleTask.goal,
        startedAt: "2026-07-08T12:00:00.000Z",
        modelId: "openai/gpt-4.1-mini",
        personaVersion: 3,
        agentOwnerId: "owner-1",
      });
      await rememberHistory(repository);

      await repository.setRunBudget("run-1", {
        iterationsUsed: 3,
        activeElapsedMs: 1_500,
      });
      await repository.appendStep(
        "run-1",
        createRunStep({
          id: "model-1",
          timestamp: "2026-07-08T12:00:01.000Z",
          kind: "model",
          text: "drafting",
        }),
      );
      await repository.appendStep(
        "run-1",
        createRunStep({
          id: "dispatch-1",
          timestamp: "2026-07-08T12:00:02.000Z",
          kind: "tool_dispatch",
          toolName: "notion.search",
        }),
      );
      await repository.appendStep(
        "run-1",
        createRunStep({
          id: "result-1",
          timestamp: "2026-07-08T12:00:03.000Z",
          kind: "tool_result",
          toolName: "notion.search",
          status: "error",
        }),
      );
      await repository.appendStep(
        "run-1",
        createRunStep({
          id: "dispatch-2",
          timestamp: "2026-07-08T12:00:04.000Z",
          kind: "tool_dispatch",
          toolName: "execute_python",
        }),
      );
      await repository.appendStep(
        "run-1",
        createRunStep({
          id: "result-2",
          timestamp: "2026-07-08T12:00:05.000Z",
          kind: "tool_result",
          toolName: "execute_python",
          status: "ok",
        }),
      );
      await repository.appendStep(
        "run-1",
        createRunStep({
          id: "wait-1",
          timestamp: "2026-07-08T12:00:06.000Z",
          kind: "waiting_approval",
          toolName: "notion.search",
        }),
      );
      await repository.appendStep(
        "run-1",
        createRunStep({
          id: "outcome-1",
          timestamp: "2026-07-08T12:00:10.000Z",
          kind: "outcome",
          outcomeStatus: "goal_met",
        }),
      );
      await repository.complete("run-1", { outcome: { status: "goal_met" } });

      const firstFollowUp = await repository.beginContinuation(
        "run-1",
        "narrow the search",
        createRunStep({
          id: "message-1",
          timestamp: "2026-07-08T12:01:00.000Z",
          kind: "user_message",
          text: "narrow the search",
        }),
      );
      assert.equal(firstFollowUp.ok, true);
      const afterReset = await readAttempts(isolated.pool, "run-1");
      assert.equal(afterReset[0]?.iterationsUsed, 3);
      assert.equal(afterReset[0]?.activeMs, 1_500);

      await repository.setRunBudget("run-1", {
        iterationsUsed: 4,
        activeElapsedMs: 800,
      });
      await repository.appendStep(
        "run-1",
        createRunStep({
          id: "model-2",
          timestamp: "2026-07-08T12:01:01.000Z",
          kind: "model",
        }),
      );
      await repository.appendStep(
        "run-1",
        createRunStep({
          id: "model-3",
          timestamp: "2026-07-08T12:01:02.000Z",
          kind: "model",
        }),
      );
      await repository.appendStep(
        "run-1",
        createRunStep({
          id: "dispatch-3",
          timestamp: "2026-07-08T12:01:03.000Z",
          kind: "tool_dispatch",
          toolName: "notion.search",
        }),
      );
      await repository.appendStep(
        "run-1",
        createRunStep({
          id: "result-3",
          timestamp: "2026-07-08T12:01:04.000Z",
          kind: "tool_result",
          toolName: "notion.search",
          status: "ok",
        }),
      );
      await repository.appendStep(
        "run-1",
        createRunStep({
          id: "outcome-2",
          timestamp: "2026-07-08T12:01:20.000Z",
          kind: "outcome",
          outcomeStatus: "failed",
          outcomeReason: "could not find the source",
        }),
      );
      await repository.complete("run-1", {
        outcome: { status: "failed", reason: "could not find the source" },
      });

      const secondFollowUp = await repository.beginContinuation(
        "run-1",
        "one more try",
        createRunStep({
          id: "message-2",
          timestamp: "2026-07-08T12:02:00.000Z",
          kind: "user_message",
          text: "one more try",
        }),
      );
      assert.equal(secondFollowUp.ok, true);
      await repository.setRunBudget("run-1", {
        iterationsUsed: 1,
        activeElapsedMs: 250,
      });
      await repository.appendStep(
        "run-1",
        createRunStep({
          id: "outcome-3",
          timestamp: "2026-07-08T12:02:30.000Z",
          kind: "outcome",
          outcomeStatus: "goal_met",
        }),
      );

      const live = await readAttempts(isolated.pool, "run-1");
      assert.deepEqual(
        live.map((row) => ({
          attemptIndex: row.attemptIndex,
          kind: row.kind,
          iterationsUsed: row.iterationsUsed,
          activeMs: row.activeMs,
          startedAt: row.startedAt,
          endedAt: row.endedAt,
          outcome: row.outcome,
          outcomeReason: row.outcomeReason,
          approvalRequestCount: row.approvalRequestCount,
          rejectionCount: row.rejectionCount,
          toolCounts: row.toolCounts,
          backfilled: row.backfilled,
          maxIterations: row.maxIterations,
          timeoutSeconds: row.timeoutSeconds,
          modelId: row.modelId,
          personaVersion: row.personaVersion,
          agentId: row.agentId,
          agentOwnerId: row.agentOwnerId,
          taskRevisionHash: row.taskRevisionHash,
        })),
        [
          {
            attemptIndex: 1,
            kind: "initial",
            iterationsUsed: 3,
            activeMs: 1_500,
            startedAt: "2026-07-08T12:00:00.000Z",
            endedAt: "2026-07-08T12:00:10.000Z",
            outcome: "goal_met",
            outcomeReason: null,
            approvalRequestCount: 1,
            rejectionCount: 0,
            toolCounts: {
              execute_python: { calls: 1, errors: 0 },
              "notion.search": { calls: 1, errors: 1 },
            },
            backfilled: false,
            maxIterations: 5,
            timeoutSeconds: 60,
            modelId: "openai/gpt-4.1-mini",
            personaVersion: 3,
            agentId: sampleTask.assignee,
            agentOwnerId: "owner-1",
            taskRevisionHash: taskRevisionHash(sampleTask),
          },
          {
            attemptIndex: 2,
            kind: "follow_up",
            iterationsUsed: 4,
            activeMs: 800,
            startedAt: "2026-07-08T12:01:00.000Z",
            endedAt: "2026-07-08T12:01:20.000Z",
            outcome: "failed",
            outcomeReason: "could not find the source",
            approvalRequestCount: 0,
            rejectionCount: 0,
            toolCounts: {
              "notion.search": { calls: 1, errors: 0 },
            },
            backfilled: false,
            maxIterations: 5,
            timeoutSeconds: 60,
            modelId: "openai/gpt-4.1-mini",
            personaVersion: 3,
            agentId: sampleTask.assignee,
            agentOwnerId: "owner-1",
            taskRevisionHash: taskRevisionHash(sampleTask),
          },
          {
            attemptIndex: 3,
            kind: "follow_up",
            iterationsUsed: 1,
            activeMs: 250,
            startedAt: "2026-07-08T12:02:00.000Z",
            endedAt: "2026-07-08T12:02:30.000Z",
            outcome: "goal_met",
            outcomeReason: null,
            approvalRequestCount: 0,
            rejectionCount: 0,
            toolCounts: {},
            backfilled: false,
            maxIterations: 5,
            timeoutSeconds: 60,
            modelId: "openai/gpt-4.1-mini",
            personaVersion: 3,
            agentId: sampleTask.assignee,
            agentOwnerId: "owner-1",
            taskRevisionHash: taskRevisionHash(sampleTask),
          },
        ],
      );

      await isolated.pool.query("DELETE FROM run_attempts WHERE run_id = $1", [
        "run-1",
      ]);
      const filled = await backfillRunAttempts(isolated.pool);
      assert.deepEqual(filled, { runs: 1, attempts: 3 });
      const backfilled = await readAttempts(isolated.pool, "run-1");
      assert.equal(backfilled.length, live.length);
      for (let index = 0; index < live.length; index += 1) {
        const liveRow = live[index];
        const backfillRow = backfilled[index];
        assert.ok(liveRow && backfillRow);
        assert.equal(backfillRow.backfilled, true);
        assert.deepEqual(
          {
            ...backfillRow,
            activeMs: liveRow.activeMs,
            iterationsUsed: liveRow.iterationsUsed,
            backfilled: liveRow.backfilled,
          },
          liveRow,
        );
      }
      assert.deepEqual(
        backfilled.map((row) => row.iterationsUsed),
        [1, 2, 0],
      );
      assert.deepEqual(
        backfilled.map((row) => row.activeMs),
        [6_000, 20_000, 30_000],
      );

      const again = await backfillRunAttempts(isolated.pool);
      assert.deepEqual(again, { runs: 0, attempts: 0 });
    } finally {
      await isolated.close();
    }
  });

  it("still records the outcome step when the attempt write fails", async () => {
    const isolated = await createSchema();
    try {
      await seedTask(isolated.pool);
      const errors: string[] = [];
      const logger: Logger = {
        debug() {},
        info() {},
        warn() {},
        error(event) {
          errors.push(event);
        },
      };
      const repository = new PgRunRepository(isolated.pool, undefined, logger);
      await repository.create({
        id: "run-1",
        taskId: "task-1",
        task: sampleTask,
        assignee: sampleTask.assignee,
        goal: sampleTask.goal,
        startedAt: "2026-07-08T12:00:00.000Z",
      });
      await isolated.pool.query(
        "ALTER TABLE run_attempts ADD CONSTRAINT reject_all CHECK (false) NOT VALID",
      );

      const report = await repository.appendStep(
        "run-1",
        createRunStep({
          id: "outcome-1",
          timestamp: "2026-07-08T12:00:10.000Z",
          kind: "outcome",
          outcomeStatus: "goal_met",
        }),
      );

      assert.deepEqual(
        report?.steps.map((step) => step.id),
        ["outcome-1"],
      );
      assert.equal(report?.stepCount, 1);
      assert.equal((await readAttempts(isolated.pool, "run-1")).length, 0);
      assert.deepEqual(errors, ["run.attempt_record_failed"]);
    } finally {
      await isolated.close();
    }
  });

  it("backfills outcomes that predate a run's first live attempt row", async () => {
    const isolated = await createSchema();
    try {
      await seedTask(isolated.pool);
      const repository = new PgRunRepository(isolated.pool);
      await repository.create({
        id: "run-1",
        taskId: "task-1",
        task: sampleTask,
        assignee: sampleTask.assignee,
        goal: sampleTask.goal,
        startedAt: "2026-07-08T12:00:00.000Z",
      });
      await rememberHistory(repository);
      await repository.appendStep(
        "run-1",
        createRunStep({
          id: "outcome-1",
          timestamp: "2026-07-08T12:00:10.000Z",
          kind: "outcome",
          outcomeStatus: "goal_met",
        }),
      );
      await repository.complete("run-1", { outcome: { status: "goal_met" } });
      await isolated.pool.query("DELETE FROM run_attempts WHERE run_id = $1", [
        "run-1",
      ]);

      const continuation = await repository.beginContinuation(
        "run-1",
        "one more try",
        createRunStep({
          id: "message-1",
          timestamp: "2026-07-08T12:01:00.000Z",
          kind: "user_message",
          text: "one more try",
        }),
      );
      assert.equal(continuation.ok, true);
      await repository.appendStep(
        "run-1",
        createRunStep({
          id: "outcome-2",
          timestamp: "2026-07-08T12:01:30.000Z",
          kind: "outcome",
          outcomeStatus: "goal_met",
        }),
      );
      const live = await readAttempts(isolated.pool, "run-1");
      assert.deepEqual(
        live.map((row) => [row.attemptIndex, row.kind, row.backfilled]),
        [[2, "follow_up", false]],
      );

      const filled = await backfillRunAttempts(isolated.pool);
      assert.deepEqual(filled, { runs: 1, attempts: 1 });
      const rows = await readAttempts(isolated.pool, "run-1");
      assert.deepEqual(
        rows.map((row) => [row.attemptIndex, row.kind, row.backfilled]),
        [
          [1, "initial", true],
          [2, "follow_up", false],
        ],
      );
      assert.deepEqual(await backfillRunAttempts(isolated.pool), {
        runs: 0,
        attempts: 0,
      });
    } finally {
      await isolated.close();
    }
  });

  it("keeps attempt rows when run-log retention deletes the run", async () => {
    const isolated = await createSchema();
    try {
      await seedTask(isolated.pool);
      const repository = new PgRunRepository(isolated.pool, 0);
      await repository.create({
        id: "run-1",
        taskId: "task-1",
        task: sampleTask,
        assignee: sampleTask.assignee,
        goal: sampleTask.goal,
        startedAt: "2026-07-08T12:00:00.000Z",
      });
      await repository.appendStep(
        "run-1",
        createRunStep({
          id: "outcome-1",
          timestamp: "2026-07-08T12:00:10.000Z",
          kind: "outcome",
          outcomeStatus: "goal_met",
        }),
      );
      await repository.complete("run-1", { outcome: { status: "goal_met" } });
      await repository.create({
        id: "run-2",
        taskId: "task-1",
        task: sampleTask,
        assignee: sampleTask.assignee,
        goal: sampleTask.goal,
        startedAt: "2026-07-08T12:05:00.000Z",
      });

      const remaining = await isolated.pool.query(
        "SELECT id FROM runs WHERE id = $1",
        ["run-1"],
      );
      assert.equal(remaining.rows.length, 0);
      const attempts = await readAttempts(isolated.pool, "run-1");
      assert.equal(attempts.length, 1);
      assert.equal(attempts[0]?.outcome, "goal_met");
    } finally {
      await isolated.close();
    }
  });

  it("drops attempt rows on their own retention, not the run-log window", async () => {
    const isolated = await createSchema();
    const previous = process.env.SHAIDEN_ATTEMPT_RETENTION_DAYS;
    delete process.env.SHAIDEN_ATTEMPT_RETENTION_DAYS;
    try {
      await seedTask(isolated.pool);
      const repository = new PgRunRepository(isolated.pool);
      const partitionMs = defaultPartitionRetentionMs();
      const attemptMs = attemptRetentionMs();
      assert.ok(
        partitionMs < attemptMs,
        "run-log retention must be shorter than attempt retention for this test",
      );
      const dayMs = 24 * 60 * 60 * 1000;
      const keptAt = new Date(
        Date.now() - (partitionMs + attemptMs) / 2,
      ).toISOString();
      const expiredAt = new Date(
        Date.now() - attemptMs - 14 * dayMs,
      ).toISOString();

      await repository.create({
        id: "run-kept",
        taskId: "task-1",
        task: sampleTask,
        assignee: sampleTask.assignee,
        goal: sampleTask.goal,
        startedAt: keptAt,
      });
      await repository.appendStep(
        "run-kept",
        createRunStep({
          id: "outcome-kept",
          timestamp: keptAt,
          kind: "outcome",
          outcomeStatus: "goal_met",
        }),
      );
      await repository.complete("run-kept", {
        outcome: { status: "goal_met" },
      });

      await repository.create({
        id: "run-expired",
        taskId: "task-1",
        task: sampleTask,
        assignee: sampleTask.assignee,
        goal: sampleTask.goal,
        startedAt: expiredAt,
      });
      await repository.appendStep(
        "run-expired",
        createRunStep({
          id: "outcome-expired",
          timestamp: expiredAt,
          kind: "outcome",
          outcomeStatus: "goal_met",
        }),
      );

      await openShaidenDatabase(resolveTestDatabaseUrl(), isolated.pool);

      const keptRun = await repository.get("run-kept");
      assert.equal(keptRun?.steps.length, 0);
      assert.equal((await readAttempts(isolated.pool, "run-kept")).length, 1);
      assert.equal(
        (await readAttempts(isolated.pool, "run-expired")).length,
        0,
      );
      const expiredRun = await isolated.pool.query(
        "SELECT id FROM runs WHERE id = $1",
        ["run-expired"],
      );
      assert.equal(expiredRun.rows.length, 1);
    } finally {
      if (previous === undefined) {
        delete process.env.SHAIDEN_ATTEMPT_RETENTION_DAYS;
      } else {
        process.env.SHAIDEN_ATTEMPT_RETENTION_DAYS = previous;
      }
      await isolated.close();
    }
  });

  it("stores null limits and a different hash from the defaults", async () => {
    const isolated = await createSchema();
    try {
      await seedTask(isolated.pool);
      const repository = new PgRunRepository(isolated.pool);
      const nullLimitsTask: Task = {
        ...sampleTask,
        limits: { max_iterations: null, timeout_seconds: null },
        modelId: undefined,
      };
      await repository.create({
        id: "run-1",
        taskId: "task-1",
        task: nullLimitsTask,
        assignee: sampleTask.assignee,
        goal: nullLimitsTask.goal,
        startedAt: "2026-07-08T12:00:00.000Z",
      });
      await repository.appendStep(
        "run-1",
        createRunStep({
          id: "outcome-1",
          timestamp: "2026-07-08T12:00:10.000Z",
          kind: "outcome",
          outcomeStatus: "goal_met",
        }),
      );

      const [attempt] = await readAttempts(isolated.pool, "run-1");
      assert.ok(attempt);
      assert.equal(attempt.maxIterations, null);
      assert.equal(attempt.timeoutSeconds, null);
      assert.equal(attempt.taskRevisionHash, taskRevisionHash(nullLimitsTask));
      assert.notEqual(
        attempt.taskRevisionHash,
        taskRevisionHash({
          ...nullLimitsTask,
          limits: undefined,
          modelId: undefined,
        }),
      );
    } finally {
      await isolated.close();
    }
  });
});
