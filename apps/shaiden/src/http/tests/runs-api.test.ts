import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Logger, Task } from "@keidai/shared";
import { ActiveRunRegistry, createActiveRunHandle } from "../../run/active-run-registry.js";
import { ShaidenHttpServer } from "../shaiden-http-server.js";
import type { RuntimeConfig } from "../../config/runtime-config.js";
import {
  createTestPersistence,
  createTestRun,
  type TestPersistence,
} from "../../testing/persistence.js";

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
  agentId: "shaiden-newsletter-01",
  toriiMcpUrl: "http://127.0.0.1:3100/mcp",
  bearerToken: "test-bearer",
  openRouterApiKey: "test-openrouter",
  modelId: "google/gemini-2.5-flash",
  httpHost: "127.0.0.1",
  httpPort: 3200,
};

async function createServer(persistence: TestPersistence) {
  const activeRunRegistry = new ActiveRunRegistry();
  const server = new ShaidenHttpServer({
    runStore: persistence.runStore,
    taskRepository: persistence.taskRepository,
    logger: silentLogger,
    agentId: testRuntimeConfig.agentId,
    runtimeConfig: testRuntimeConfig,
    activeRunRegistry,
    startTaskRun: ({ task, taskId }) => {
      persistence.runStore.createRun({
        id: "run-ignored",
        taskId,
        task,
        assignee: task.assignee,
        goal: task.goal,
      });
      return {
        runId: "run-ignored",
        done: Promise.resolve({
          run: {
            id: "run-ignored",
            task,
            startedAt: new Date().toISOString(),
            outcome: { status: "goal_met" },
          },
          discoveredTools: [],
          iterations: 1,
        }),
      };
    },
    resumeHarnessRun: ({ runId }) => ({
      runId,
      done: new Promise(() => {}),
    }),
  });
  const app = await server.createApp();
  return { app, activeRunRegistry };
}

describe("runs follow-up API", () => {
  it("accepts a follow-up on a terminal failed run", async () => {
    const persistence = createTestPersistence("sqlite");
    const { app } = await createServer(persistence);
    try {
      createTestRun(persistence, { runId: "run-1", task: sampleTask });
      persistence.runStore.setConversationHistory("run-1", [
        { role: "user", text: "goal" },
        { role: "assistant", text: "failed", toolCalls: [] },
      ]);
      persistence.runStore.completeRun("run-1", {
        outcome: { status: "failed", reason: "tool error" },
      });

      const response = await app.inject({
        method: "POST",
        url: "/api/runs/run-1/follow-up",
        payload: { message: "try again" },
      });

      assert.equal(response.statusCode, 202);
      const reopened = persistence.runStore.getRun("run-1");
      assert.equal(reopened?.status, "running");
      assert.equal(reopened?.steps.at(-1)?.kind, "user_message");
    } finally {
      persistence.close();
    }
  });

  it("queues a follow-up while waiting for approval", async () => {
    const persistence = createTestPersistence("sqlite");
    const { app, activeRunRegistry } = await createServer(persistence);
    try {
      createTestRun(persistence, { runId: "run-1", task: sampleTask });
      const handle = createActiveRunHandle("run-1");
      handle.setWaitingForApproval(true);
      activeRunRegistry.register(handle);

      const response = await app.inject({
        method: "POST",
        url: "/api/runs/run-1/follow-up",
        payload: { message: "use the backup path" },
      });

      assert.equal(response.statusCode, 202);
      assert.deepEqual(handle.drainPendingUserMessages(), [
        { role: "user", text: "use the backup path" },
      ]);
      assert.equal(
        persistence.runStore.getRun("run-1")?.steps.at(-1)?.kind,
        "user_message",
      );
    } finally {
      persistence.close();
    }
  });

  it("rejects continuation when history is missing", async () => {
    const persistence = createTestPersistence("sqlite");
    const { app } = await createServer(persistence);
    try {
      createTestRun(persistence, { runId: "run-1", task: sampleTask });
      persistence.runStore.completeRun("run-1", { outcome: { status: "goal_met" } });

      const response = await app.inject({
        method: "POST",
        url: "/api/runs/run-1/follow-up",
        payload: { message: "summarize" },
      });

      assert.equal(response.statusCode, 409);
    } finally {
      persistence.close();
    }
  });

  it("rejects follow-up while actively running without a waiting handle", async () => {
    const persistence = createTestPersistence("sqlite");
    const { app } = await createServer(persistence);
    try {
      createTestRun(persistence, { runId: "run-1", task: sampleTask });

      const response = await app.inject({
        method: "POST",
        url: "/api/runs/run-1/follow-up",
        payload: { message: "too soon" },
      });

      assert.equal(response.statusCode, 409);
      assert.match(response.json().error, /not accepting follow-up/);
    } finally {
      persistence.close();
    }
  });

  it("rejects follow-up for ineligible outcomes", async () => {
    const persistence = createTestPersistence("sqlite");
    const { app } = await createServer(persistence);
    try {
      createTestRun(persistence, { runId: "run-1", task: sampleTask });
      persistence.runStore.setConversationHistory("run-1", [
        { role: "user", text: "goal" },
        { role: "assistant", text: "rejected", toolCalls: [] },
      ]);
      persistence.runStore.completeRun("run-1", { outcome: { status: "human_reject" } });

      const response = await app.inject({
        method: "POST",
        url: "/api/runs/run-1/follow-up",
        payload: { message: "try again" },
      });

      assert.equal(response.statusCode, 409);
      assert.match(response.json().error, /cannot be continued/);
    } finally {
      persistence.close();
    }
  });

  it("rejects invalid follow-up messages", async () => {
    const persistence = createTestPersistence("sqlite");
    const { app } = await createServer(persistence);
    try {
      createTestRun(persistence, { runId: "run-1", task: sampleTask });
      persistence.runStore.setConversationHistory("run-1", [
        { role: "user", text: "goal" },
      ]);
      persistence.runStore.completeRun("run-1", { outcome: { status: "goal_met" } });

      const empty = await app.inject({
        method: "POST",
        url: "/api/runs/run-1/follow-up",
        payload: { message: "   " },
      });
      assert.equal(empty.statusCode, 400);
    } finally {
      persistence.close();
    }
  });
});
