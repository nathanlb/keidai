import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { operatorContextHeaders, type Logger, type Task } from "@keidai/shared";
import type { RuntimeConfig } from "../../config/runtime-config.js";
import { createRunStep } from "../../runs/utils/create-run-step.js";
import { ShaidenHttpServer } from "../shaiden-http-server.js";
import {
  createTestPersistence,
  type TestPersistence,
} from "../../testing/persistence.js";

process.env.BFF_SERVICE_TOKEN_DISABLED ??= "true";

const silentLogger: Logger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
};

const sampleTask: Task = {
  goal: "Compose and send the keidai status newsletter.",
  trigger: { type: "now" },
  assignee: "shaiden-newsletter-01",
  limits: { max_iterations: 5, timeout_seconds: 60 },
};

const testRuntimeConfig: RuntimeConfig = {
  toriiMcpUrl: "http://127.0.0.1:3100/mcp",
  getSubjectToken: () => "test-bearer",
  openRouterApiKey: "test-openrouter",
  modelId: "deepseek/deepseek-v4.1-flash",
  httpHost: "127.0.0.1",
  httpPort: 3200,
};

async function serverFor(persistence: TestPersistence) {
  const server = new ShaidenHttpServer({
    runStore: persistence.runStore,
    taskRepository: persistence.taskRepository,
    pool: persistence.pool,
    logger: silentLogger,
    runtimeConfig: testRuntimeConfig,
    startTaskRun: async () => ({
      runId: "unused",
      done: Promise.resolve({
        run: {
          id: "unused",
          task: sampleTask,
          startedAt: new Date().toISOString(),
          outcome: { status: "goal_met" },
        },
        discoveredTools: [],
        iterations: 1,
      }),
    }),
    resumeHarnessRun: ({ runId }) => ({
      runId,
      done: new Promise(() => {}),
    }),
  });
  return server.createApp();
}

describe("attempt verdicts", () => {
  it("lets the owner set, change, and clear a verdict that outlives the run", async () => {
    const persistence = await createTestPersistence();
    const app = await serverFor(persistence);
    const owner = operatorContextHeaders({
      ownerId: "owner-a",
      role: "member",
    });
    const other = operatorContextHeaders({
      ownerId: "owner-b",
      role: "member",
    });
    try {
      const task = await persistence.taskRepository.create({
        task: sampleTask,
      });
      await persistence.runStore.createRun({
        id: "run-1",
        taskId: task.id,
        task: sampleTask,
        assignee: sampleTask.assignee,
        goal: sampleTask.goal,
        agentOwnerId: "owner-a",
      });
      await persistence.runStore.appendStep(
        "run-1",
        createRunStep({
          timestamp: "2026-07-08T12:00:10.000Z",
          kind: "outcome",
          outcomeStatus: "goal_met",
        }),
      );
      await persistence.runStore.completeRun("run-1", {
        outcome: { status: "goal_met" },
      });

      const invalid = await app.inject({
        method: "PUT",
        url: "/api/runs/run-1/attempts/1/verdict",
        headers: owner,
        payload: { verdict: "sideways" },
      });
      assert.equal(invalid.statusCode, 400);

      const denied = await app.inject({
        method: "PUT",
        url: "/api/runs/run-1/attempts/1/verdict",
        headers: other,
        payload: { verdict: "down", note: "wrong answer" },
      });
      assert.equal(denied.statusCode, 403);

      const marked = await app.inject({
        method: "PUT",
        url: "/api/runs/run-1/attempts/1/verdict",
        headers: owner,
        payload: { verdict: "down", note: "wrong answer" },
      });
      assert.equal(marked.statusCode, 200);
      assert.equal(marked.json().verdict, "down");
      assert.equal(marked.json().operatorId, "owner-a");

      const changed = await app.inject({
        method: "PUT",
        url: "/api/runs/run-1/attempts/1/verdict",
        headers: owner,
        payload: { verdict: "up" },
      });
      assert.equal(changed.statusCode, 200);
      assert.equal(changed.json().verdict, "up");
      assert.equal(changed.json().note, null);

      await persistence.pool.query("DELETE FROM run_steps WHERE run_id = $1", [
        "run-1",
      ]);
      await persistence.pool.query(
        "DELETE FROM run_follow_ups WHERE run_id = $1",
        ["run-1"],
      );
      await persistence.pool.query("DELETE FROM runs WHERE id = $1", ["run-1"]);
      const listed = await app.inject({
        method: "GET",
        url: "/api/runs/run-1/attempts",
        headers: owner,
      });
      assert.equal(listed.statusCode, 200);
      assert.equal(listed.json().attempts[0].verdict, "up");

      const hidden = await app.inject({
        method: "GET",
        url: "/api/runs/run-1/attempts",
        headers: other,
      });
      assert.equal(hidden.statusCode, 404);

      const cleared = await app.inject({
        method: "DELETE",
        url: "/api/runs/run-1/attempts/1/verdict",
        headers: owner,
      });
      assert.equal(cleared.statusCode, 200);
      assert.equal(cleared.json().verdict, null);
    } finally {
      await persistence.close();
    }
  });
});
