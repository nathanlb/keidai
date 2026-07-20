import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Logger, Task } from "@keidai/shared";
import type { HarnessRunResult } from "../../run/types/harness.js";
import type { LaunchedHarnessRun } from "../../run/types/harness.js";
import { ActiveRunRegistry } from "../../run/active-run-registry.js";
import { resumeHarnessRun } from "../../run/harness.js";
import type { RuntimeConfig } from "../../config/runtime-config.js";
import { ShaidenHttpServer } from "../shaiden-http-server.js";
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

function createTestServer({
  persistence = createTestPersistence("sqlite"),
  startTaskRun,
}: {
  persistence?: TestPersistence;
  startTaskRun?: (input: { task: Task; taskId: string }) => LaunchedHarnessRun;
} = {}) {
  const launched: Array<{ task: Task; taskId: string }> = [];
  const { runStore, taskRepository } = persistence;
  const activeRunRegistry = new ActiveRunRegistry();
  const runtimeConfig = testRuntimeConfig;
  const server = new ShaidenHttpServer({
    runStore,
    taskRepository,
    logger: silentLogger,
    agentId: "shaiden-newsletter-01",
    runtimeConfig,
    activeRunRegistry,
    resumeHarnessRun: (input) =>
      resumeHarnessRun({
        ...input,
        config: runtimeConfig,
        options: { activeRunRegistry, logger: silentLogger },
      }),
    startTaskRun:
      startTaskRun ??
      (({ task, taskId }) => {
        launched.push({ task, taskId });
        runStore.createRun({
          id: "run-1",
          taskId,
          task,
          assignee: task.assignee,
          goal: task.goal,
        });
        return {
          runId: "run-1",
          done: Promise.resolve({
            run: {
              id: "run-1",
              task,
              startedAt: new Date().toISOString(),
              outcome: { status: "goal_met" },
            },
            discoveredTools: [],
            iterations: 1,
          } satisfies HarnessRunResult),
        };
      }),
  });
  return { server, runStore, taskRepository, launched, persistence };
}

describe("tasks API", () => {
  it("creates a saved task", async () => {
    const { server, persistence } = createTestServer({
      startTaskRun: () => {
        throw new Error("should not start");
      },
    });
    const handle = await server.start({ host: "127.0.0.1", port: 0 });
    try {
      const response = await fetch(`${handle.baseUrl}/api/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sampleTask),
      });
      assert.equal(response.status, 201);
      const body = (await response.json()) as { task: { id: string } };
      assert.ok(body.task.id);
    } finally {
      await handle.close();
      persistence.close();
    }
  });

  it("accepts create-and-run and returns run and task ids", async () => {
    const { server, launched, persistence } = createTestServer();
    const handle = await server.start({ host: "127.0.0.1", port: 0 });
    try {
      const response = await fetch(`${handle.baseUrl}/api/tasks/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sampleTask),
      });
      assert.equal(response.status, 202);
      const body = (await response.json()) as { runId: string; taskId: string };
      assert.equal(body.runId, "run-1");
      assert.ok(body.taskId);
      assert.equal(launched.length, 1);
      assert.equal(launched[0]?.task.goal, sampleTask.goal);
    } finally {
      await handle.close();
      persistence.close();
    }
  });

  it("starts a run from a saved task", async () => {
    const { server, taskRepository, launched, persistence } = createTestServer();
    const saved = taskRepository.create({ task: sampleTask });
    const handle = await server.start({ host: "127.0.0.1", port: 0 });
    try {
      const response = await fetch(
        `${handle.baseUrl}/api/tasks/${saved.id}/run`,
        { method: "POST" },
      );
      assert.equal(response.status, 202);
      const body = (await response.json()) as { runId: string; taskId: string };
      assert.equal(body.taskId, saved.id);
      assert.equal(launched[0]?.taskId, saved.id);
    } finally {
      await handle.close();
      persistence.close();
    }
  });

  it("lists, gets, updates, and deletes saved tasks", async () => {
    const { server, persistence } = createTestServer({
      startTaskRun: () => {
        throw new Error("should not start");
      },
    });
    const handle = await server.start({ host: "127.0.0.1", port: 0 });
    try {
      const createResponse = await fetch(`${handle.baseUrl}/api/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sampleTask),
      });
      assert.equal(createResponse.status, 201);
      const created = (await createResponse.json()) as {
        task: { id: string; goal: string };
      };
      const taskId = created.task.id;

      const listResponse = await fetch(`${handle.baseUrl}/api/tasks`);
      assert.equal(listResponse.status, 200);
      const listed = (await listResponse.json()) as {
        tasks: Array<{ id: string }>;
      };
      assert.equal(listed.tasks.length, 1);
      assert.equal(listed.tasks[0]?.id, taskId);

      const getResponse = await fetch(`${handle.baseUrl}/api/tasks/${taskId}`);
      assert.equal(getResponse.status, 200);
      const fetched = (await getResponse.json()) as {
        task: { id: string; goal: string };
      };
      assert.equal(fetched.task.id, taskId);
      assert.equal(fetched.task.goal, sampleTask.goal);

      const patchResponse = await fetch(`${handle.baseUrl}/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goal: "Updated newsletter goal" }),
      });
      assert.equal(patchResponse.status, 200);
      const updated = (await patchResponse.json()) as {
        task: { goal: string };
      };
      assert.equal(updated.task.goal, "Updated newsletter goal");

      const deleteResponse = await fetch(`${handle.baseUrl}/api/tasks/${taskId}`, {
        method: "DELETE",
      });
      assert.equal(deleteResponse.status, 204);

      const missingResponse = await fetch(`${handle.baseUrl}/api/tasks/${taskId}`);
      assert.equal(missingResponse.status, 404);
    } finally {
      await handle.close();
      persistence.close();
    }
  });

  it("rejects an invalid task body", async () => {
    const { server, persistence } = createTestServer({
      startTaskRun: () => {
        throw new Error("should not start");
      },
    });
    const handle = await server.start({ host: "127.0.0.1", port: 0 });
    try {
      const response = await fetch(`${handle.baseUrl}/api/tasks/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goal: "" }),
      });
      assert.equal(response.status, 400);
      const body = (await response.json()) as { error: string };
      assert.equal(body.error, "invalid task");
    } finally {
      await handle.close();
      persistence.close();
    }
  });

  it("rejects assignee mismatch", async () => {
    const { server, persistence } = createTestServer({
      startTaskRun: () => {
        throw new Error("should not start");
      },
    });
    const handle = await server.start({ host: "127.0.0.1", port: 0 });
    try {
      const response = await fetch(`${handle.baseUrl}/api/tasks/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...sampleTask,
          assignee: "other-agent",
        }),
      });
      assert.equal(response.status, 400);
      const body = (await response.json()) as { error: string };
      assert.match(body.error, /assignee must match/);
    } finally {
      await handle.close();
      persistence.close();
    }
  });

  it("rejects when a run is already in progress", async () => {
    const persistence = createTestPersistence("sqlite");
    createTestRun(persistence, {
      runId: "existing",
      task: sampleTask,
      goal: "already running",
    });

    const { server } = createTestServer({
      persistence,
      startTaskRun: () => {
        throw new Error("should not start");
      },
    });
    const handle = await server.start({ host: "127.0.0.1", port: 0 });
    try {
      const response = await fetch(`${handle.baseUrl}/api/tasks/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sampleTask),
      });
      assert.equal(response.status, 409);
    } finally {
      await handle.close();
      persistence.close();
    }
  });

  it("rejects deleting a task that has runs", async () => {
    const persistence = createTestPersistence("sqlite");
    const taskId = createTestRun(persistence, { runId: "run-1", task: sampleTask });

    const { server } = createTestServer({ persistence });
    const handle = await server.start({ host: "127.0.0.1", port: 0 });
    try {
      const response = await fetch(`${handle.baseUrl}/api/tasks/${taskId}`, {
        method: "DELETE",
      });
      assert.equal(response.status, 409);
    } finally {
      await handle.close();
      persistence.close();
    }
  });

  it("exposes agentId on health and runtime", async () => {
    const { server, persistence } = createTestServer({
      startTaskRun: () => {
        throw new Error("unused");
      },
    });
    const handle = await server.start({ host: "127.0.0.1", port: 0 });
    try {
      const health = await fetch(`${handle.baseUrl}/api/health`);
      assert.equal(health.status, 200);
      assert.deepEqual(await health.json(), {
        ok: true,
        version: "0.0.0",
        agentId: "shaiden-newsletter-01",
      });

      const runtime = await fetch(`${handle.baseUrl}/api/tasks/runtime`);
      assert.equal(runtime.status, 200);
      assert.deepEqual(await runtime.json(), {
        agentId: "shaiden-newsletter-01",
      });
    } finally {
      await handle.close();
      persistence.close();
    }
  });
});
