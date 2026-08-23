import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createIsolatedSchema,
  resolveTestDatabaseUrl,
  type IsolatedSchema,
  type Pool,
} from "@keidai/postgres";
import { openShaidenDatabase } from "../../storage/shaiden-postgres.js";
import { createRunStep } from "../utils/create-run-step.js";
import { PgRunRepository } from "../pg-run-repository.js";
import { TaskAlreadyRunningError } from "../types/run-repository.js";

const sampleTask = {
  goal: "Compose and send the keidai status newsletter.",
  trigger: { type: "now" as const },
  assignee: "shaiden-newsletter-01",
  limits: { max_iterations: 5, timeout_seconds: 60 },
};

async function createSchema(): Promise<IsolatedSchema> {
  const isolated = await createIsolatedSchema();
  await openShaidenDatabase(resolveTestDatabaseUrl(), isolated.pool);
  return isolated;
}

function createRepository(pool: Pool): PgRunRepository {
  return new PgRunRepository(pool);
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

describe("PgRunRepository", () => {
  it("appends steps, completes runs, and persists across instances", async () => {
    const isolated = await createSchema();
    try {
      await seedTask(isolated.pool);
      const repository = createRepository(isolated.pool);
      const created = await repository.create({
        id: "run-1",
        taskId: "task-1",
        task: sampleTask,
        assignee: sampleTask.assignee,
        goal: sampleTask.goal,
        startedAt: "2026-07-08T12:00:00.000Z",
      });
      assert.equal(created.taskId, "task-1");
      assert.equal(created.status, "running");

      await repository.appendStep("run-1", {
        id: "step-1",
        timestamp: "2026-07-08T12:00:01.000Z",
        kind: "tool_result",
        toolName: "notion_search",
        status: "error",
        outputPreview: "policy denied",
      });

      const completed = await repository.complete("run-1", {
        outcome: {
          status: "failed",
          reason: 'tool call "notion_search" returned an error: policy denied',
        },
      });
      assert.equal(completed?.status, "completed");
      assert.equal(completed?.steps.length, 1);
      const firstStep = completed?.steps[0];
      assert.equal(firstStep?.kind, "tool_result");
      if (firstStep?.kind === "tool_result") {
        assert.equal(firstStep.outputPreview, "policy denied");
      }

      const secondRepository = createRepository(isolated.pool);
      const loaded = await secondRepository.get("run-1");
      assert.equal(loaded?.task.goal, sampleTask.goal);
      assert.equal(loaded?.outcome?.status, "failed");
      if (loaded?.outcome?.status === "failed") {
        assert.match(loaded.outcome.reason, /policy denied/);
      }
      assert.equal(loaded?.steps[0]?.kind, "tool_result");
      if (loaded?.steps[0]?.kind === "tool_result") {
        assert.equal(loaded.steps[0].outputPreview, "policy denied");
      }
    } finally {
      await isolated.close();
    }
  });

  it("stamps persona version and content onto the run at create", async () => {
    const isolated = await createSchema();
    try {
      await seedTask(isolated.pool);
      const repository = createRepository(isolated.pool);
      await repository.create({
        id: "run-1",
        taskId: "task-1",
        task: sampleTask,
        assignee: sampleTask.assignee,
        goal: sampleTask.goal,
        personaVersion: 2,
        persona: "You are a careful newsletter author.",
      });

      const loaded = await createRepository(isolated.pool).get("run-1");
      assert.equal(loaded?.personaVersion, 2);
      assert.equal(loaded?.persona, "You are a careful newsletter author.");
      assert.equal(loaded?.task.goal, sampleTask.goal);
    } finally {
      await isolated.close();
    }
  });

  it("allows tool_dispatch and tool_result as separate steps for one tool call", async () => {
    const isolated = await createSchema();
    try {
      await seedTask(isolated.pool);
      const repository = createRepository(isolated.pool);
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
          timestamp: "2026-07-08T12:00:01.000Z",
          kind: "tool_dispatch",
          toolName: "notion.notion-search",
          toolCallId: "call-1",
          inputPreview: '{"query":"jobs"}',
        }),
      );
      await repository.appendStep(
        "run-1",
        createRunStep({
          timestamp: "2026-07-08T12:00:02.000Z",
          kind: "tool_result",
          toolName: "notion.notion-search",
          toolCallId: "call-1",
          status: "ok",
          charCount: 42,
        }),
      );

      const run = await repository.get("run-1");
      assert.equal(run?.stepCount, 2);
      assert.equal(run?.steps.length, 2);
      assert.equal(run?.steps[0]?.kind, "tool_dispatch");
      assert.equal(run?.steps[1]?.kind, "tool_result");
      assert.notEqual(run?.steps[0]?.id, run?.steps[1]?.id);
    } finally {
      await isolated.close();
    }
  });

  it("orders steps by timestamp then id when timestamps collide", async () => {
    const isolated = await createSchema();
    try {
      await seedTask(isolated.pool);
      const repository = createRepository(isolated.pool);
      await repository.create({
        id: "run-1",
        taskId: "task-1",
        task: sampleTask,
        assignee: sampleTask.assignee,
        goal: sampleTask.goal,
        startedAt: "2026-07-08T12:00:00.000Z",
      });

      const sharedTimestamp = "2026-07-08T12:00:01.000Z";
      await repository.appendStep(
        "run-1",
        createRunStep({
          id: "step-1-dispatch",
          timestamp: sharedTimestamp,
          kind: "tool_dispatch",
          toolName: "notion_search",
          toolCallId: "call-1",
          inputPreview: "{}",
        }),
      );
      await repository.appendStep(
        "run-1",
        createRunStep({
          id: "step-2-result",
          timestamp: sharedTimestamp,
          kind: "tool_result",
          toolName: "notion_search",
          toolCallId: "call-1",
          status: "error",
          charCount: 13,
          outputPreview: "policy denied",
        }),
      );

      const run = await repository.get("run-1");
      assert.equal(run?.steps[0]?.kind, "tool_dispatch");
      assert.equal(run?.steps[1]?.kind, "tool_result");
    } finally {
      await isolated.close();
    }
  });

  it("rejects a second continuation while the run is already reopened", async () => {
    const isolated = await createSchema();
    try {
      await seedTask(isolated.pool);
      const repository = createRepository(isolated.pool);
      await repository.create({
        id: "run-1",
        taskId: "task-1",
        task: sampleTask,
        assignee: sampleTask.assignee,
        goal: sampleTask.goal,
        startedAt: "2026-07-08T12:00:00.000Z",
      });
      await repository.setConversationHistory("run-1", [
        { role: "user", text: "goal" },
        { role: "assistant", text: "failed attempt", toolCalls: [] },
      ]);
      await repository.complete("run-1", {
        outcome: { status: "failed", reason: "tool error" },
      });

      const first = await repository.beginContinuation(
        "run-1",
        "try again",
        createRunStep({
          timestamp: "2026-07-08T12:00:02.000Z",
          kind: "user_message",
          text: "try again",
        }),
      );
      assert.equal(first.ok, true);

      const reopened = await repository.get("run-1");
      assert.equal(reopened?.status, "running");
      assert.equal(reopened?.outcome, undefined);
      assert.equal(reopened?.steps.at(-1)?.kind, "user_message");

      const second = await repository.beginContinuation(
        "run-1",
        "duplicate",
        createRunStep({
          timestamp: "2026-07-08T12:00:03.000Z",
          kind: "user_message",
          text: "duplicate",
        }),
      );
      assert.deepEqual(second, { ok: false, reason: "not_terminal" });
    } finally {
      await isolated.close();
    }
  });

  it("reopens a stopped run without appending a user message", async () => {
    const isolated = await createSchema();
    try {
      await seedTask(isolated.pool);
      const repository = createRepository(isolated.pool);
      await repository.create({
        id: "run-1",
        taskId: "task-1",
        task: sampleTask,
        assignee: sampleTask.assignee,
        goal: sampleTask.goal,
        startedAt: "2026-07-08T12:00:00.000Z",
      });
      const history = [
        { role: "user" as const, text: "goal" },
        { role: "assistant" as const, text: "working", toolCalls: [] },
      ];
      await repository.setConversationHistory("run-1", history);
      await repository.complete("run-1", { outcome: { status: "stopped" } });

      const result = await repository.beginContinuation("run-1");
      assert.equal(result.ok, true);
      if (result.ok) {
        assert.deepEqual(result.history, history);
      }

      const reopened = await repository.get("run-1");
      assert.equal(reopened?.status, "running");
      assert.equal(reopened?.outcome, undefined);
      assert.equal(reopened?.steps.length, 0);
    } finally {
      await isolated.close();
    }
  });

  it("rejects continuation without persisted history", async () => {
    const isolated = await createSchema();
    try {
      await seedTask(isolated.pool);
      const repository = createRepository(isolated.pool);
      await repository.create({
        id: "run-1",
        taskId: "task-1",
        task: sampleTask,
        assignee: sampleTask.assignee,
        goal: sampleTask.goal,
        startedAt: "2026-07-08T12:00:00.000Z",
      });
      await repository.complete("run-1", { outcome: { status: "goal_met" } });

      const result = await repository.beginContinuation(
        "run-1",
        "summarize",
        createRunStep({
          timestamp: "2026-07-08T12:00:02.000Z",
          kind: "user_message",
          text: "summarize",
        }),
      );

      assert.deepEqual(result, { ok: false, reason: "missing_history" });
    } finally {
      await isolated.close();
    }
  });

  it("persists a parked MCP task id across repository instances", async () => {
    const isolated = await createSchema();
    try {
      await seedTask(isolated.pool);
      const repository = createRepository(isolated.pool);
      await repository.create({
        id: "run-1",
        taskId: "task-1",
        task: sampleTask,
        assignee: sampleTask.assignee,
        goal: sampleTask.goal,
        startedAt: "2026-07-08T12:00:00.000Z",
      });
      assert.equal(
        await repository.setParkedMcpTask("run-1", {
          mcpTaskId: "a".repeat(64),
          pollIntervalMs: 1_500,
        }),
        true,
      );

      const reloaded = createRepository(isolated.pool);
      assert.deepEqual(await reloaded.getParkedMcpTask("run-1"), {
        runId: "run-1",
        mcpTaskId: "a".repeat(64),
        pollIntervalMs: 1_500,
      });
      assert.deepEqual(await reloaded.listParkedMcpTasks(), [
        {
          runId: "run-1",
          mcpTaskId: "a".repeat(64),
          pollIntervalMs: 1_500,
        },
      ]);

      await reloaded.clearParkedMcpTask("run-1");
      assert.equal(
        await createRepository(isolated.pool).getParkedMcpTask("run-1"),
        null,
      );
    } finally {
      await isolated.close();
    }
  });

  it("clears a parked MCP task when the run completes", async () => {
    const isolated = await createSchema();
    try {
      await seedTask(isolated.pool);
      const repository = createRepository(isolated.pool);
      await repository.create({
        id: "run-1",
        taskId: "task-1",
        task: sampleTask,
        assignee: sampleTask.assignee,
        goal: sampleTask.goal,
      });
      await repository.setParkedMcpTask("run-1", { mcpTaskId: "parked-1" });
      await repository.complete("run-1", { outcome: { status: "goal_met" } });

      assert.equal(await repository.getParkedMcpTask("run-1"), null);
      assert.deepEqual(await repository.listParkedMcpTasks(), []);
    } finally {
      await isolated.close();
    }
  });

  it("queues parked follow-ups from another repository instance", async () => {
    const isolated = await createSchema();
    try {
      await seedTask(isolated.pool);
      const writer = createRepository(isolated.pool);
      await writer.create({
        id: "run-1",
        taskId: "task-1",
        task: sampleTask,
        assignee: sampleTask.assignee,
        goal: sampleTask.goal,
      });
      await writer.setParkedMcpTask("run-1", { mcpTaskId: "parked-1" });

      const otherReplica = createRepository(isolated.pool);
      assert.equal(
        await otherReplica.enqueueParkedFollowUp(
          "run-1",
          "use the backup path",
          createRunStep({
            timestamp: "2026-07-08T12:00:02.000Z",
            kind: "user_message",
            text: "use the backup path",
          }),
        ),
        true,
      );
      assert.equal(
        await otherReplica.enqueueParkedFollowUp(
          "run-1",
          "and skip the draft",
          createRunStep({
            timestamp: "2026-07-08T12:00:03.000Z",
            kind: "user_message",
            text: "and skip the draft",
          }),
        ),
        true,
      );

      const owner = createRepository(isolated.pool);
      assert.deepEqual(await owner.drainParkedFollowUps("run-1"), [
        { role: "user", text: "use the backup path" },
        { role: "user", text: "and skip the draft" },
      ]);
      assert.deepEqual(await owner.drainParkedFollowUps("run-1"), []);
      assert.equal((await owner.get("run-1"))?.steps.at(-1)?.kind, "user_message");
    } finally {
      await isolated.close();
    }
  });

  it("rejects follow-up enqueue unless the run is parked", async () => {
    const isolated = await createSchema();
    try {
      await seedTask(isolated.pool);
      const repository = createRepository(isolated.pool);
      await repository.create({
        id: "run-1",
        taskId: "task-1",
        task: sampleTask,
        assignee: sampleTask.assignee,
        goal: sampleTask.goal,
      });

      assert.equal(
        await repository.enqueueParkedFollowUp(
          "run-1",
          "too soon",
          createRunStep({
            timestamp: "2026-07-08T12:00:02.000Z",
            kind: "user_message",
            text: "too soon",
          }),
        ),
        false,
      );
    } finally {
      await isolated.close();
    }
  });

  it("claims a run exclusively and allows reclaim after the lease expires", async () => {
    const isolated = await createSchema();
    try {
      await seedTask(isolated.pool);
      const replicaA = createRepository(isolated.pool);
      await replicaA.create({
        id: "run-1",
        taskId: "task-1",
        task: sampleTask,
        assignee: sampleTask.assignee,
        goal: sampleTask.goal,
      });
      await replicaA.setParkedMcpTask("run-1", { mcpTaskId: "parked-1" });

      const now = "2026-07-08T12:00:00.000Z";
      const leaseA = "2026-07-08T12:00:15.000Z";
      assert.equal(await replicaA.claimRun("run-1", "replica-a", leaseA, now), true);

      const replicaB = createRepository(isolated.pool);
      assert.equal(
        await replicaB.claimRun("run-1", "replica-b", "2026-07-08T12:00:30.000Z", now),
        false,
      );
      assert.equal(
        await replicaB.renewRunLease("run-1", "replica-b", "2026-07-08T12:00:30.000Z"),
        false,
      );
      assert.equal(
        await replicaA.renewRunLease("run-1", "replica-a", "2026-07-08T12:00:20.000Z"),
        true,
      );

      assert.deepEqual(await replicaB.listClaimableParkedMcpTasks(now), []);
      assert.equal(
        (await replicaB.listClaimableParkedMcpTasks("2026-07-08T12:00:20.001Z")).length,
        1,
      );
      assert.equal(
        await replicaB.claimRun(
          "run-1",
          "replica-b",
          "2026-07-08T12:00:35.000Z",
          "2026-07-08T12:00:20.001Z",
        ),
        true,
      );
      assert.equal(await replicaA.renewRunLease("run-1", "replica-a", leaseA), false);
    } finally {
      await isolated.close();
    }
  });

  it("rejects a second running run for the same task and allows another task", async () => {
    const isolated = await createSchema();
    try {
      await seedTask(isolated.pool);
      await seedTask(isolated.pool, "task-2");
      const repository = createRepository(isolated.pool);

      const first = await repository.create({
        id: "run-1",
        taskId: "task-1",
        task: sampleTask,
        assignee: sampleTask.assignee,
        goal: sampleTask.goal,
        startedAt: "2026-07-08T12:00:00.000Z",
      });
      assert.equal(first.status, "running");

      await assert.rejects(
        () =>
          repository.create({
            id: "run-1b",
            taskId: "task-1",
            task: sampleTask,
            assignee: sampleTask.assignee,
            goal: sampleTask.goal,
            startedAt: "2026-07-08T12:00:01.000Z",
          }),
        (error: unknown) => error instanceof TaskAlreadyRunningError,
      );

      const otherTask = await repository.create({
        id: "run-2",
        taskId: "task-2",
        task: sampleTask,
        assignee: sampleTask.assignee,
        goal: sampleTask.goal,
        startedAt: "2026-07-08T12:00:02.000Z",
      });
      assert.equal(otherTask.status, "running");
      assert.deepEqual(await repository.listRunningRuns(), [
        { id: "run-1", taskId: "task-1" },
        { id: "run-2", taskId: "task-2" },
      ]);

      await repository.complete("run-1", {
        outcome: { status: "goal_met" },
      });
      const resumed = await repository.create({
        id: "run-1c",
        taskId: "task-1",
        task: sampleTask,
        assignee: sampleTask.assignee,
        goal: sampleTask.goal,
        startedAt: "2026-07-08T12:02:00.000Z",
      });
      assert.equal(resumed.status, "running");
      assert.deepEqual(await repository.listRunningRuns(), [
        { id: "run-2", taskId: "task-2" },
        { id: "run-1c", taskId: "task-1" },
      ]);
    } finally {
      await isolated.close();
    }
  });
});
