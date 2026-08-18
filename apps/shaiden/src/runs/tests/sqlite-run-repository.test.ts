import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { openShaidenDatabase } from "../../storage/shaiden-sqlite.js";
import { createRunStep } from "../utils/create-run-step.js";
import { SqliteRunRepository } from "../sqlite-run-repository.js";
import { TaskAlreadyRunningError } from "../types/run-repository.js";

const sampleTask = {
  goal: "Compose and send the keidai status newsletter.",
  trigger: { type: "now" as const },
  assignee: "shaiden-newsletter-01",
  limits: { max_iterations: 5, timeout_seconds: 60 },
};

function createRepository(databasePath: string): SqliteRunRepository {
  return new SqliteRunRepository(openShaidenDatabase(databasePath));
}

function seedTask(databasePath: string, taskId = "task-1"): string {
  const db = openShaidenDatabase(databasePath);
  db.prepare(`
    INSERT INTO tasks (
      id, goal, trigger_json, assignee, limits_json, created_at, updated_at
    ) VALUES (
      @id, @goal, @trigger_json, @assignee, @limits_json, @created_at, @updated_at
    )
  `).run({
    id: taskId,
    goal: sampleTask.goal,
    trigger_json: JSON.stringify(sampleTask.trigger),
    assignee: sampleTask.assignee,
    limits_json: JSON.stringify(sampleTask.limits),
    created_at: "2026-07-08T12:00:00.000Z",
    updated_at: "2026-07-08T12:00:00.000Z",
  });
  db.close();
  return databasePath;
}

function tempDatabasePath(): string {
  return path.join(
    mkdtempSync(path.join(tmpdir(), "shaiden-run-store-")),
    "shaiden.db",
  );
}

describe("SqliteRunRepository", () => {
  it("appends steps, completes runs, and persists across instances", () => {
    const databasePath = path.join(
      mkdtempSync(path.join(tmpdir(), "shaiden-run-store-")),
      "shaiden.db",
    );
    const db = openShaidenDatabase(databasePath);
    db.prepare(`
      INSERT INTO tasks (
        id, goal, trigger_json, assignee, limits_json, created_at, updated_at
      ) VALUES (
        'task-1', @goal, @trigger_json, @assignee, @limits_json, @created_at, @updated_at
      )
    `).run({
      goal: sampleTask.goal,
      trigger_json: JSON.stringify(sampleTask.trigger),
      assignee: sampleTask.assignee,
      limits_json: JSON.stringify(sampleTask.limits),
      created_at: "2026-07-08T12:00:00.000Z",
      updated_at: "2026-07-08T12:00:00.000Z",
    });

    const repository = createRepository(databasePath);
    const created = repository.create({
      id: "run-1",
      taskId: "task-1",
      task: sampleTask,
      assignee: sampleTask.assignee,
      goal: sampleTask.goal,
      startedAt: "2026-07-08T12:00:00.000Z",
    });
    assert.equal(created.taskId, "task-1");
    assert.equal(created.status, "running");

    repository.appendStep("run-1", {
      id: "step-1",
      timestamp: "2026-07-08T12:00:01.000Z",
      kind: "tool_result",
      toolName: "notion_search",
      status: "error",
      outputPreview: "policy denied",
    });

    const completed = repository.complete("run-1", {
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

    const secondRepository = createRepository(databasePath);
    const loaded = secondRepository.get("run-1");
    assert.equal(loaded?.task.goal, sampleTask.goal);
    assert.equal(loaded?.outcome?.status, "failed");
    if (loaded?.outcome?.status === "failed") {
      assert.match(loaded.outcome.reason, /policy denied/);
    }
    assert.equal(loaded?.steps[0]?.kind, "tool_result");
    if (loaded?.steps[0]?.kind === "tool_result") {
      assert.equal(loaded.steps[0].outputPreview, "policy denied");
    }
  });

  it("stamps persona version and content onto the run at create", () => {
    const databasePath = path.join(
      mkdtempSync(path.join(tmpdir(), "shaiden-run-store-")),
      "shaiden.db",
    );
    const db = openShaidenDatabase(databasePath);
    db.prepare(`
      INSERT INTO tasks (
        id, goal, trigger_json, assignee, limits_json, created_at, updated_at
      ) VALUES (
        'task-1', @goal, @trigger_json, @assignee, @limits_json, @created_at, @updated_at
      )
    `).run({
      goal: sampleTask.goal,
      trigger_json: JSON.stringify(sampleTask.trigger),
      assignee: sampleTask.assignee,
      limits_json: JSON.stringify(sampleTask.limits),
      created_at: "2026-07-08T12:00:00.000Z",
      updated_at: "2026-07-08T12:00:00.000Z",
    });

    const repository = createRepository(databasePath);
    repository.create({
      id: "run-1",
      taskId: "task-1",
      task: sampleTask,
      assignee: sampleTask.assignee,
      goal: sampleTask.goal,
      personaVersion: 2,
      persona: "You are a careful newsletter author.",
    });

    const loaded = createRepository(databasePath).get("run-1");
    assert.equal(loaded?.personaVersion, 2);
    assert.equal(loaded?.persona, "You are a careful newsletter author.");
    assert.equal(loaded?.task.goal, sampleTask.goal);
  });

  it("allows tool_dispatch and tool_result as separate steps for one tool call", () => {
    const databasePath = path.join(
      mkdtempSync(path.join(tmpdir(), "shaiden-run-store-")),
      "shaiden.db",
    );
    const db = openShaidenDatabase(databasePath);
    db.prepare(`
      INSERT INTO tasks (
        id, goal, trigger_json, assignee, limits_json, created_at, updated_at
      ) VALUES (
        'task-1', @goal, @trigger_json, @assignee, @limits_json, @created_at, @updated_at
      )
    `).run({
      goal: sampleTask.goal,
      trigger_json: JSON.stringify(sampleTask.trigger),
      assignee: sampleTask.assignee,
      limits_json: JSON.stringify(sampleTask.limits),
      created_at: "2026-07-08T12:00:00.000Z",
      updated_at: "2026-07-08T12:00:00.000Z",
    });

    const repository = createRepository(databasePath);
    repository.create({
      id: "run-1",
      taskId: "task-1",
      task: sampleTask,
      assignee: sampleTask.assignee,
      goal: sampleTask.goal,
      startedAt: "2026-07-08T12:00:00.000Z",
    });

    repository.appendStep(
      "run-1",
      createRunStep({
        timestamp: "2026-07-08T12:00:01.000Z",
        kind: "tool_dispatch",
        toolName: "notion.notion-search",
        toolCallId: "call-1",
        inputPreview: '{"query":"jobs"}',
      }),
    );
    repository.appendStep(
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

    const run = repository.get("run-1");
    assert.equal(run?.stepCount, 2);
    assert.equal(run?.steps.length, 2);
    assert.equal(run?.steps[0]?.kind, "tool_dispatch");
    assert.equal(run?.steps[1]?.kind, "tool_result");
    assert.notEqual(run?.steps[0]?.id, run?.steps[1]?.id);
  });

  it("preserves append order when steps share the same timestamp", () => {
    const databasePath = path.join(
      mkdtempSync(path.join(tmpdir(), "shaiden-run-store-")),
      "shaiden.db",
    );
    const db = openShaidenDatabase(databasePath);
    db.prepare(`
      INSERT INTO tasks (
        id, goal, trigger_json, assignee, limits_json, created_at, updated_at
      ) VALUES (
        'task-1', @goal, @trigger_json, @assignee, @limits_json, @created_at, @updated_at
      )
    `).run({
      goal: sampleTask.goal,
      trigger_json: JSON.stringify(sampleTask.trigger),
      assignee: sampleTask.assignee,
      limits_json: JSON.stringify(sampleTask.limits),
      created_at: "2026-07-08T12:00:00.000Z",
      updated_at: "2026-07-08T12:00:00.000Z",
    });

    const repository = createRepository(databasePath);
    repository.create({
      id: "run-1",
      taskId: "task-1",
      task: sampleTask,
      assignee: sampleTask.assignee,
      goal: sampleTask.goal,
      startedAt: "2026-07-08T12:00:00.000Z",
    });

    const sharedTimestamp = "2026-07-08T12:00:01.000Z";
    repository.appendStep(
      "run-1",
      createRunStep({
        id: "zzz-dispatch",
        timestamp: sharedTimestamp,
        kind: "tool_dispatch",
        toolName: "notion_search",
        toolCallId: "call-1",
        inputPreview: "{}",
      }),
    );
    repository.appendStep(
      "run-1",
      createRunStep({
        id: "aaa-result",
        timestamp: sharedTimestamp,
        kind: "tool_result",
        toolName: "notion_search",
        toolCallId: "call-1",
        status: "error",
        charCount: 13,
        outputPreview: "policy denied",
      }),
    );

    const run = repository.get("run-1");
    assert.equal(run?.steps[0]?.kind, "tool_dispatch");
    assert.equal(run?.steps[1]?.kind, "tool_result");
  });

  it("rejects a second continuation while the run is already reopened", () => {
    const databasePath = path.join(
      mkdtempSync(path.join(tmpdir(), "shaiden-run-store-")),
      "shaiden.db",
    );
    const db = openShaidenDatabase(databasePath);
    db.prepare(`
      INSERT INTO tasks (
        id, goal, trigger_json, assignee, limits_json, created_at, updated_at
      ) VALUES (
        'task-1', @goal, @trigger_json, @assignee, @limits_json, @created_at, @updated_at
      )
    `).run({
      goal: sampleTask.goal,
      trigger_json: JSON.stringify(sampleTask.trigger),
      assignee: sampleTask.assignee,
      limits_json: JSON.stringify(sampleTask.limits),
      created_at: "2026-07-08T12:00:00.000Z",
      updated_at: "2026-07-08T12:00:00.000Z",
    });

    const repository = createRepository(databasePath);
    repository.create({
      id: "run-1",
      taskId: "task-1",
      task: sampleTask,
      assignee: sampleTask.assignee,
      goal: sampleTask.goal,
      startedAt: "2026-07-08T12:00:00.000Z",
    });
    repository.setConversationHistory("run-1", [
      { role: "user", text: "goal" },
      { role: "assistant", text: "failed attempt", toolCalls: [] },
    ]);
    repository.complete("run-1", {
      outcome: { status: "failed", reason: "tool error" },
    });

    const first = repository.beginContinuation(
      "run-1",
      "try again",
      createRunStep({
        timestamp: "2026-07-08T12:00:02.000Z",
        kind: "user_message",
        text: "try again",
      }),
    );
    assert.equal(first.ok, true);

    const reopened = repository.get("run-1");
    assert.equal(reopened?.status, "running");
    assert.equal(reopened?.outcome, undefined);
    assert.equal(reopened?.steps.at(-1)?.kind, "user_message");

    const second = repository.beginContinuation(
      "run-1",
      "duplicate",
      createRunStep({
        timestamp: "2026-07-08T12:00:03.000Z",
        kind: "user_message",
        text: "duplicate",
      }),
    );
    assert.deepEqual(second, { ok: false, reason: "not_terminal" });
  });

  it("rejects continuation without persisted history", () => {
    const databasePath = path.join(
      mkdtempSync(path.join(tmpdir(), "shaiden-run-store-")),
      "shaiden.db",
    );
    const db = openShaidenDatabase(databasePath);
    db.prepare(`
      INSERT INTO tasks (
        id, goal, trigger_json, assignee, limits_json, created_at, updated_at
      ) VALUES (
        'task-1', @goal, @trigger_json, @assignee, @limits_json, @created_at, @updated_at
      )
    `).run({
      goal: sampleTask.goal,
      trigger_json: JSON.stringify(sampleTask.trigger),
      assignee: sampleTask.assignee,
      limits_json: JSON.stringify(sampleTask.limits),
      created_at: "2026-07-08T12:00:00.000Z",
      updated_at: "2026-07-08T12:00:00.000Z",
    });

    const repository = createRepository(databasePath);
    repository.create({
      id: "run-1",
      taskId: "task-1",
      task: sampleTask,
      assignee: sampleTask.assignee,
      goal: sampleTask.goal,
      startedAt: "2026-07-08T12:00:00.000Z",
    });
    repository.complete("run-1", { outcome: { status: "goal_met" } });

    const result = repository.beginContinuation(
      "run-1",
      "summarize",
      createRunStep({
        timestamp: "2026-07-08T12:00:02.000Z",
        kind: "user_message",
        text: "summarize",
      }),
    );

    assert.deepEqual(result, { ok: false, reason: "missing_history" });
  });

  it("persists a parked MCP task id across repository instances", () => {
    const databasePath = path.join(
      mkdtempSync(path.join(tmpdir(), "shaiden-run-store-")),
      "shaiden.db",
    );
    const db = openShaidenDatabase(databasePath);
    db.prepare(`
      INSERT INTO tasks (
        id, goal, trigger_json, assignee, limits_json, created_at, updated_at
      ) VALUES (
        'task-1', @goal, @trigger_json, @assignee, @limits_json, @created_at, @updated_at
      )
    `).run({
      goal: sampleTask.goal,
      trigger_json: JSON.stringify(sampleTask.trigger),
      assignee: sampleTask.assignee,
      limits_json: JSON.stringify(sampleTask.limits),
      created_at: "2026-07-08T12:00:00.000Z",
      updated_at: "2026-07-08T12:00:00.000Z",
    });

    const repository = createRepository(databasePath);
    repository.create({
      id: "run-1",
      taskId: "task-1",
      task: sampleTask,
      assignee: sampleTask.assignee,
      goal: sampleTask.goal,
      startedAt: "2026-07-08T12:00:00.000Z",
    });
    assert.equal(
      repository.setParkedMcpTask("run-1", {
        mcpTaskId: "a".repeat(64),
        pollIntervalMs: 1_500,
      }),
      true,
    );

    const reloaded = createRepository(databasePath);
    assert.deepEqual(reloaded.getParkedMcpTask("run-1"), {
      runId: "run-1",
      mcpTaskId: "a".repeat(64),
      pollIntervalMs: 1_500,
    });
    assert.deepEqual(reloaded.listParkedMcpTasks(), [
      {
        runId: "run-1",
        mcpTaskId: "a".repeat(64),
        pollIntervalMs: 1_500,
      },
    ]);

    reloaded.clearParkedMcpTask("run-1");
    assert.equal(createRepository(databasePath).getParkedMcpTask("run-1"), null);
  });

  it("clears a parked MCP task when the run completes", () => {
    const databasePath = path.join(
      mkdtempSync(path.join(tmpdir(), "shaiden-run-store-")),
      "shaiden.db",
    );
    const db = openShaidenDatabase(databasePath);
    db.prepare(`
      INSERT INTO tasks (
        id, goal, trigger_json, assignee, limits_json, created_at, updated_at
      ) VALUES (
        'task-1', @goal, @trigger_json, @assignee, @limits_json, @created_at, @updated_at
      )
    `).run({
      goal: sampleTask.goal,
      trigger_json: JSON.stringify(sampleTask.trigger),
      assignee: sampleTask.assignee,
      limits_json: JSON.stringify(sampleTask.limits),
      created_at: "2026-07-08T12:00:00.000Z",
      updated_at: "2026-07-08T12:00:00.000Z",
    });

    const repository = createRepository(databasePath);
    repository.create({
      id: "run-1",
      taskId: "task-1",
      task: sampleTask,
      assignee: sampleTask.assignee,
      goal: sampleTask.goal,
    });
    repository.setParkedMcpTask("run-1", { mcpTaskId: "parked-1" });
    repository.complete("run-1", { outcome: { status: "goal_met" } });

    assert.equal(repository.getParkedMcpTask("run-1"), null);
    assert.deepEqual(repository.listParkedMcpTasks(), []);
  });

  it("queues parked follow-ups from another repository instance", () => {
    const databasePath = seedTask(tempDatabasePath());
    const writer = createRepository(databasePath);
    writer.create({
      id: "run-1",
      taskId: "task-1",
      task: sampleTask,
      assignee: sampleTask.assignee,
      goal: sampleTask.goal,
    });
    writer.setParkedMcpTask("run-1", { mcpTaskId: "parked-1" });

    const otherReplica = createRepository(databasePath);
    assert.equal(
      otherReplica.enqueueParkedFollowUp(
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
      otherReplica.enqueueParkedFollowUp(
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

    const owner = createRepository(databasePath);
    assert.deepEqual(owner.drainParkedFollowUps("run-1"), [
      { role: "user", text: "use the backup path" },
      { role: "user", text: "and skip the draft" },
    ]);
    assert.deepEqual(owner.drainParkedFollowUps("run-1"), []);
    assert.equal(owner.get("run-1")?.steps.at(-1)?.kind, "user_message");
  });

  it("rejects follow-up enqueue unless the run is parked", () => {
    const databasePath = seedTask(tempDatabasePath());
    const repository = createRepository(databasePath);
    repository.create({
      id: "run-1",
      taskId: "task-1",
      task: sampleTask,
      assignee: sampleTask.assignee,
      goal: sampleTask.goal,
    });

    assert.equal(
      repository.enqueueParkedFollowUp(
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
  });

  it("claims a run exclusively and allows reclaim after the lease expires", () => {
    const databasePath = seedTask(tempDatabasePath());
    const replicaA = createRepository(databasePath);
    replicaA.create({
      id: "run-1",
      taskId: "task-1",
      task: sampleTask,
      assignee: sampleTask.assignee,
      goal: sampleTask.goal,
    });
    replicaA.setParkedMcpTask("run-1", { mcpTaskId: "parked-1" });

    const now = "2026-07-08T12:00:00.000Z";
    const leaseA = "2026-07-08T12:00:15.000Z";
    assert.equal(replicaA.claimRun("run-1", "replica-a", leaseA, now), true);

    const replicaB = createRepository(databasePath);
    assert.equal(
      replicaB.claimRun("run-1", "replica-b", "2026-07-08T12:00:30.000Z", now),
      false,
    );
    assert.equal(
      replicaB.renewRunLease("run-1", "replica-b", "2026-07-08T12:00:30.000Z"),
      false,
    );
    assert.equal(
      replicaA.renewRunLease("run-1", "replica-a", "2026-07-08T12:00:20.000Z"),
      true,
    );

    assert.deepEqual(replicaB.listClaimableParkedMcpTasks(now), []);
    assert.equal(
      replicaB.listClaimableParkedMcpTasks("2026-07-08T12:00:20.001Z").length,
      1,
    );
    assert.equal(
      replicaB.claimRun(
        "run-1",
        "replica-b",
        "2026-07-08T12:00:35.000Z",
        "2026-07-08T12:00:20.001Z",
      ),
      true,
    );
    assert.equal(replicaA.renewRunLease("run-1", "replica-a", leaseA), false);
  });

  it("rejects a second running run for the same task and allows another task", () => {
    const databasePath = seedTask(tempDatabasePath());
    seedTask(databasePath, "task-2");
    const repository = createRepository(databasePath);

    const first = repository.create({
      id: "run-1",
      taskId: "task-1",
      task: sampleTask,
      assignee: sampleTask.assignee,
      goal: sampleTask.goal,
      startedAt: "2026-07-08T12:00:00.000Z",
    });
    assert.equal(first.status, "running");

    assert.throws(
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

    const otherTask = repository.create({
      id: "run-2",
      taskId: "task-2",
      task: sampleTask,
      assignee: sampleTask.assignee,
      goal: sampleTask.goal,
      startedAt: "2026-07-08T12:00:02.000Z",
    });
    assert.equal(otherTask.status, "running");
    assert.deepEqual(repository.listRunningRuns(), [
      { id: "run-1", taskId: "task-1" },
      { id: "run-2", taskId: "task-2" },
    ]);

    repository.complete("run-1", {
      outcome: { status: "goal_met" },
    });
    const resumed = repository.create({
      id: "run-1c",
      taskId: "task-1",
      task: sampleTask,
      assignee: sampleTask.assignee,
      goal: sampleTask.goal,
      startedAt: "2026-07-08T12:02:00.000Z",
    });
    assert.equal(resumed.status, "running");
    assert.deepEqual(repository.listRunningRuns(), [
      { id: "run-2", taskId: "task-2" },
      { id: "run-1c", taskId: "task-1" },
    ]);
  });
});
