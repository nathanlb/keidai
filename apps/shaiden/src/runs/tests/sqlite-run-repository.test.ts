import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { openShaidenDatabase } from "../../storage/shaiden-sqlite.js";
import { createRunStep } from "../utils/create-run-step.js";
import { SqliteRunRepository } from "../sqlite-run-repository.js";

const sampleTask = {
  goal: "Compose and send the keidai status newsletter.",
  trigger: { type: "now" as const },
  assignee: "shaiden-newsletter-01",
  limits: { max_iterations: 5, timeout_seconds: 60 },
};

function createRepository(databasePath: string): SqliteRunRepository {
  return new SqliteRunRepository(openShaidenDatabase(databasePath));
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
});
