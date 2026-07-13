import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Logger, Task } from "@keidai/shared";
import { ShaidenHttpServer } from "../shaiden-http-server.js";
import { RunStore } from "../../runs/run-store.js";

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

describe("tasks API", () => {
  it("accepts a valid task and returns a run id", async () => {
    const runStore = new RunStore();
    const launched: Task[] = [];
    const server = new ShaidenHttpServer({
      runStore,
      logger: silentLogger,
      agentId: "shaiden-newsletter-01",
      startTaskRun: (task) => {
        launched.push(task);
        runStore.createRun({
          id: "run-1",
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
          }),
        };
      },
    });

    const handle = await server.start({ host: "127.0.0.1", port: 0 });
    try {
      const response = await fetch(`${handle.baseUrl}/api/tasks/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sampleTask),
      });
      assert.equal(response.status, 202);
      assert.deepEqual(await response.json(), { runId: "run-1" });
      assert.equal(launched.length, 1);
      assert.equal(launched[0]?.goal, sampleTask.goal);
    } finally {
      await handle.close();
    }
  });

  it("rejects an invalid task body", async () => {
    const server = new ShaidenHttpServer({
      runStore: new RunStore(),
      logger: silentLogger,
      agentId: "shaiden-newsletter-01",
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
    }
  });

  it("rejects assignee mismatch", async () => {
    const server = new ShaidenHttpServer({
      runStore: new RunStore(),
      logger: silentLogger,
      agentId: "shaiden-newsletter-01",
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
    }
  });

  it("rejects when a run is already in progress", async () => {
    const runStore = new RunStore();
    runStore.createRun({
      id: "existing",
      assignee: "shaiden-newsletter-01",
      goal: "already running",
    });

    const server = new ShaidenHttpServer({
      runStore,
      logger: silentLogger,
      agentId: "shaiden-newsletter-01",
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
    }
  });

  it("exposes agentId on health and runtime", async () => {
    const server = new ShaidenHttpServer({
      runStore: new RunStore(),
      logger: silentLogger,
      agentId: "shaiden-newsletter-01",
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
        agentId: "shaiden-newsletter-01",
      });

      const runtime = await fetch(`${handle.baseUrl}/api/tasks/runtime`);
      assert.equal(runtime.status, 200);
      assert.deepEqual(await runtime.json(), {
        agentId: "shaiden-newsletter-01",
      });
    } finally {
      await handle.close();
    }
  });
});
