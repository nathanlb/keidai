import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { operatorContextHeaders, type Logger, type Task } from "@keidai/shared";
import type { RuntimeConfig } from "../../config/runtime-config.js";
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
  assignee: "agent-1",
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

describe("stats api", () => {
  it("returns task stats to the owner and hides another owner's agent", async () => {
    const persistence = await createTestPersistence();
    const app = await serverFor(persistence);
    const owner = operatorContextHeaders({ ownerId: "ada", role: "member" });
    const other = operatorContextHeaders({ ownerId: "bob", role: "member" });
    try {
      const task = await persistence.taskRepository.create({
        task: sampleTask,
      });
      for (let index = 0; index < 10; index += 1) {
        await persistence.pool.query(
          `
            INSERT INTO run_attempts (
              id, run_id, attempt_index, kind, task_id, agent_id, agent_owner_id,
              model_id, task_revision_hash, max_iterations, timeout_seconds,
              started_at, ended_at, active_ms, iterations_used,
              outcome, failure_class, tool_counts_json,
              approval_request_count, rejection_count
            ) VALUES (
              $1, $2, 1, 'initial', $3, 'agent-1', 'ada',
              'model-a', 'hash', 5, 60,
              NOW(), NOW(), 1000, 2,
              'goal_met', NULL, '{}'::jsonb,
              0, 0
            )
          `,
          [`attempt-${index}`, `run-${index}`, task.id],
        );
      }
      await persistence.pool.query(
        `
          INSERT INTO run_attempts (
            id, run_id, attempt_index, kind, task_id, agent_id, agent_owner_id,
            model_id, task_revision_hash, started_at, ended_at, active_ms,
            iterations_used, outcome, failure_class, tool_counts_json,
            approval_request_count, rejection_count
          ) VALUES (
            'platform-1', 'run-platform', 1, 'initial', $1, 'agent-1', 'ada',
            'model-a', 'hash', NOW(), NOW(), 10,
            1, 'failed', 'platform', '{}'::jsonb,
            0, 0
          )
        `,
        [task.id],
      );

      const stats = await app.inject({
        method: "GET",
        url: `/api/stats/tasks/${task.id}?window=all&scope=all&kind=all`,
        headers: owner,
      });
      assert.equal(stats.statusCode, 200);
      assert.equal(stats.json().platformFailureCount, 1);
      assert.equal(stats.json().byAgentModel[0].proportion.eligible, 10);
      assert.equal(stats.json().byAgentModel[0].proportion.rate, 1);

      const hidden = await app.inject({
        method: "GET",
        url: "/api/stats/agents/agent-1?window=all&scope=all&kind=all",
        headers: other,
      });
      assert.equal(hidden.statusCode, 404);

      const visible = await app.inject({
        method: "GET",
        url: "/api/stats/agents/agent-1?window=all&scope=all&kind=all",
        headers: owner,
      });
      assert.equal(visible.statusCode, 200);
      assert.equal(visible.json().attemptCount, 11);
    } finally {
      await persistence.close();
    }
  });
});
