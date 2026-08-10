import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Logger, Task } from "@keidai/shared";
import {
  AgentDefinitionError,
  type FudaClient,
} from "@keidai/shared/clients";
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

// Opt out of ecosystem BFF service-token hardening for HTTP unit tests.
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
  modelId: "google/gemini-2.5-flash",
  httpHost: "127.0.0.1",
  httpPort: 3200,
};

function createTestServer({
  persistence = createTestPersistence(),
  startTaskRun,
  fudaClient,
}: {
  persistence?: TestPersistence;
  startTaskRun?: (input: {
    task: Task;
    taskId: string;
  }) => Promise<LaunchedHarnessRun>;
  fudaClient?: FudaClient;
} = {}) {
  const launched: Array<{ task: Task; taskId: string }> = [];
  const { runStore, taskRepository } = persistence;
  const activeRunRegistry = new ActiveRunRegistry();
  const runtimeConfig = testRuntimeConfig;
  const server = new ShaidenHttpServer({
    runStore,
    taskRepository,
    logger: silentLogger,
    runtimeConfig,
    fudaClient,
    activeRunRegistry,
    resumeHarnessRun: (input) =>
      resumeHarnessRun({
        ...input,
        config: runtimeConfig,
        options: { activeRunRegistry, logger: silentLogger },
      }),
    startTaskRun:
      startTaskRun ??
      (async ({ task, taskId }) => {
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

  it("lists, gets, updates, and archives saved tasks", async () => {
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

      const archiveResponse = await fetch(`${handle.baseUrl}/api/tasks/${taskId}`, {
        method: "DELETE",
      });
      assert.equal(archiveResponse.status, 204);

      const archivedListResponse = await fetch(`${handle.baseUrl}/api/tasks`);
      const archivedList = (await archivedListResponse.json()) as {
        tasks: Array<{ id: string }>;
      };
      assert.equal(archivedList.tasks.length, 0);

      const archivedGetResponse = await fetch(
        `${handle.baseUrl}/api/tasks/${taskId}`,
      );
      assert.equal(archivedGetResponse.status, 200);
      const archivedTask = (await archivedGetResponse.json()) as {
        task: { archivedAt?: string };
      };
      assert.ok(archivedTask.task.archivedAt);

      const rearchiveResponse = await fetch(`${handle.baseUrl}/api/tasks/${taskId}`, {
        method: "DELETE",
      });
      assert.equal(rearchiveResponse.status, 404);
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

  it("rejects unknown assignee when Fuda does not know the agent", async () => {
    const { server, persistence } = createTestServer({
      fudaClient: {
        exchangeToken: async () => {
          throw new Error("unused");
        },
        getAgentDefinition: async () => {
          throw new AgentDefinitionError("agent_not_found", "Fuda agent not found", {
            status: 404,
          });
        },
      },
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
      assert.equal(response.status, 422);
      const body = (await response.json()) as { error: string };
      assert.match(body.error, /unknown agent/i);
    } finally {
      await handle.close();
      persistence.close();
    }
  });

  it("rejects when a run is already in progress", async () => {
    const persistence = createTestPersistence();
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

  it("archives a task that has runs", async () => {
    const persistence = createTestPersistence();
    const taskId = createTestRun(persistence, { runId: "run-1", task: sampleTask });

    const { server } = createTestServer({ persistence });
    const handle = await server.start({ host: "127.0.0.1", port: 0 });
    try {
      const response = await fetch(`${handle.baseUrl}/api/tasks/${taskId}`, {
        method: "DELETE",
      });
      assert.equal(response.status, 204);

      const listResponse = await fetch(`${handle.baseUrl}/api/tasks`);
      const listed = (await listResponse.json()) as {
        tasks: Array<{ id: string }>;
      };
      assert.equal(listed.tasks.length, 0);

      const getResponse = await fetch(`${handle.baseUrl}/api/tasks/${taskId}`);
      assert.equal(getResponse.status, 200);
      const archived = (await getResponse.json()) as {
        task: { archivedAt?: string };
      };
      assert.ok(archived.task.archivedAt);
    } finally {
      await handle.close();
      persistence.close();
    }
  });

  it("rejects patch and run for archived tasks", async () => {
    const { server, taskRepository, persistence } = createTestServer({
      startTaskRun: () => {
        throw new Error("should not start");
      },
    });
    const saved = taskRepository.create({ task: sampleTask });
    assert.equal(taskRepository.archive(saved.id), true);
    const handle = await server.start({ host: "127.0.0.1", port: 0 });
    try {
      const patchResponse = await fetch(`${handle.baseUrl}/api/tasks/${saved.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goal: "Should not apply" }),
      });
      assert.equal(patchResponse.status, 409);
      const patchBody = (await patchResponse.json()) as { error: string };
      assert.equal(patchBody.error, "task is archived");

      const runResponse = await fetch(`${handle.baseUrl}/api/tasks/${saved.id}/run`, {
        method: "POST",
      });
      assert.equal(runResponse.status, 409);
      const runBody = (await runResponse.json()) as { error: string };
      assert.equal(runBody.error, "task is archived");
    } finally {
      await handle.close();
      persistence.close();
    }
  });

  it("exposes health and runtime readiness", async () => {
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
      });

      const runtime = await fetch(`${handle.baseUrl}/api/tasks/runtime`);
      assert.equal(runtime.status, 200);
      assert.deepEqual(await runtime.json(), {
        ready: true,
      });
    } finally {
      await handle.close();
      persistence.close();
    }
  });

  it("accepts different assignees when Fuda knows both agents", async () => {
    const otherTask: Task = {
      ...sampleTask,
      assignee: "other-agent-02",
      goal: "Run as a different agent.",
    };
    const { server, launched, persistence } = createTestServer({
      fudaClient: {
        exchangeToken: async () => {
          throw new Error("unused");
        },
        getAgentDefinition: async (agentId: string) => ({
          name: agentId,
          slug: agentId,
          persona: `Persona for ${agentId}`,
          personaVersion: 1,
        }),
      },
    });
    const handle = await server.start({ host: "127.0.0.1", port: 0 });
    try {
      const first = await fetch(`${handle.baseUrl}/api/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sampleTask),
      });
      assert.equal(first.status, 201);

      const second = await fetch(`${handle.baseUrl}/api/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(otherTask),
      });
      assert.equal(second.status, 201);

      const runResponse = await fetch(`${handle.baseUrl}/api/tasks/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(otherTask),
      });
      assert.equal(runResponse.status, 202);
      assert.equal(launched.at(-1)?.task.assignee, "other-agent-02");
    } finally {
      await handle.close();
      persistence.close();
    }
  });

  it("rejects create when Fuda does not know the assignee", async () => {
    const { server, persistence } = createTestServer({
      fudaClient: {
        exchangeToken: async () => {
          throw new Error("unused");
        },
        getAgentDefinition: async () => {
          throw new AgentDefinitionError("agent_not_found", "Fuda agent not found", {
            status: 404,
          });
        },
      },
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
      assert.equal(response.status, 422);
      const body = (await response.json()) as { error: string };
      assert.match(body.error, /unknown agent/i);
      assert.equal(persistence.taskRepository.list().tasks.length, 0);
    } finally {
      await handle.close();
      persistence.close();
    }
  });

  it("fails task start when Fuda agent is unknown", async () => {
    const { server, persistence } = createTestServer({
      startTaskRun: async () => {
        throw new AgentDefinitionError("agent_not_found", "Fuda agent not found", {
          status: 404,
        });
      },
    });
    const handle = await server.start({ host: "127.0.0.1", port: 0 });
    try {
      const response = await fetch(`${handle.baseUrl}/api/tasks/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sampleTask),
      });
      assert.equal(response.status, 422);
      const body = (await response.json()) as { error: string };
      assert.match(body.error, /unknown agent/i);
      assert.equal(persistence.runStore.listRuns().runs.length, 0);
      assert.equal(persistence.taskRepository.list().tasks.length, 0);
    } finally {
      await handle.close();
      persistence.close();
    }
  });

  it("fails task start when Fuda is unreachable", async () => {
    const { server, persistence } = createTestServer({
      startTaskRun: async () => {
        throw new AgentDefinitionError(
          "unreachable",
          "Fuda unreachable while fetching agent definition",
        );
      },
    });
    const handle = await server.start({ host: "127.0.0.1", port: 0 });
    try {
      const response = await fetch(`${handle.baseUrl}/api/tasks/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sampleTask),
      });
      assert.equal(response.status, 503);
      const body = (await response.json()) as { error: string };
      assert.match(body.error, /Fuda unreachable/i);
      assert.equal(persistence.runStore.listRuns().runs.length, 0);
      assert.equal(persistence.taskRepository.list().tasks.length, 0);
    } finally {
      await handle.close();
      persistence.close();
    }
  });
});
