import "reflect-metadata";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TEST_AGENT_PRINCIPAL } from "../../identity/tests/test-helpers.js";
import { createTestGatewayPersistence } from "../../testing/gateway-persistence.js";
import { TaskStoreService } from "../task-store.service.js";
import { McpTaskLookupError } from "../types/mcp-task.js";
import { generateMcpTaskId } from "../utils/generate-mcp-task-id.js";

const OTHER_AGENT_ID = "other-agent";

async function catchLookup(fn: () => Promise<unknown>): Promise<McpTaskLookupError> {
  try {
    await fn();
  } catch (error) {
    assert.ok(error instanceof McpTaskLookupError);
    return error;
  }
  assert.fail("expected McpTaskLookupError");
}

async function createStore(): Promise<{
  store: TaskStoreService;
  close: () => Promise<void>;
  pool: NonNullable<
    Awaited<Awaited<ReturnType<typeof createTestGatewayPersistence>>>["pool"]
  >;
}> {
  const persistence = await createTestGatewayPersistence("postgres");
  assert.ok(persistence.pool);
  assert.ok(persistence.taskStore);
  return {
    store: persistence.taskStore,
    pool: persistence.pool,
    close: persistence.close,
  };
}

describe("generateMcpTaskId", () => {
  it("returns 256-bit CSPRNG hex ids that do not collide", () => {
    const ids = new Set(Array.from({ length: 64 }, () => generateMcpTaskId()));
    assert.equal(ids.size, 64);
    for (const id of ids) {
      assert.match(id, /^[0-9a-f]{64}$/);
    }
  });
});

describe("TaskStoreService postgres persistence", () => {
  it("creates a working task that is readable before CreateTaskResult would be sent", async () => {
    const { store, close } = await createStore();
    try {
      const created = await store.createWorkingTask({
        agentId: TEST_AGENT_PRINCIPAL.agentId,
        ownerId: TEST_AGENT_PRINCIPAL.ownerId,
        statusMessage: "Waiting on approval",
      });
      assert.equal(created.status, "working");
      assert.equal(created.statusMessage, "Waiting on approval");
      assert.equal(typeof created.ttlMs, "number");
      assert.equal(created.pollIntervalMs, 5000);
      assert.match(created.taskId, /^[0-9a-f]{64}$/);

      const got = await store.getDetailedTask(
        TEST_AGENT_PRINCIPAL.agentId,
        created.taskId,
      );
      assert.equal(got.taskId, created.taskId);
      assert.equal(got.status, "working");
      assert.equal(got.createdAt, created.createdAt);
    } finally {
      await close();
    }
  });

  it("is readable from another store instance sharing the same database", async () => {
    const { store, close, pool } = await createStore();
    try {
      const created = await store.createWorkingTask({
        agentId: TEST_AGENT_PRINCIPAL.agentId,
        ownerId: TEST_AGENT_PRINCIPAL.ownerId,
      });

      const peer = new TaskStoreService(pool);
      const got = await peer.getDetailedTask(
        TEST_AGENT_PRINCIPAL.agentId,
        created.taskId,
      );
      assert.equal(got.taskId, created.taskId);
      assert.equal(got.status, "working");
    } finally {
      await close();
    }
  });

  it("survives process restart", async () => {
    const { store, close, pool } = await createStore();
    try {
      const created = await store.createWorkingTask({
        agentId: TEST_AGENT_PRINCIPAL.agentId,
        ownerId: TEST_AGENT_PRINCIPAL.ownerId,
        statusMessage: "in progress",
      });

      const reopened = new TaskStoreService(pool);
      const got = await reopened.getDetailedTask(
        TEST_AGENT_PRINCIPAL.agentId,
        created.taskId,
      );
      assert.equal(got.taskId, created.taskId);
      assert.equal(got.statusMessage, "in progress");
    } finally {
      await close();
    }
  });

  it("rejects another principal without disclosing that the task exists", async () => {
    const { store, close } = await createStore();
    try {
      const created = await store.createWorkingTask({
        agentId: TEST_AGENT_PRINCIPAL.agentId,
        ownerId: TEST_AGENT_PRINCIPAL.ownerId,
      });

      const otherError = await catchLookup(() =>
        store.getDetailedTask(OTHER_AGENT_ID, created.taskId),
      );
      const missingError = await catchLookup(() =>
        store.getDetailedTask(TEST_AGENT_PRINCIPAL.agentId, "no-such-task"),
      );

      assert.equal(otherError.reason, "not_found");
      assert.equal(missingError.reason, "not_found");
      assert.equal(otherError.message, missingError.message);
    } finally {
      await close();
    }
  });

  it("expires tasks by query rather than process lifetime", async () => {
    const { store, close } = await createStore();
    try {
      const now = 1_000_000;
      const created = await store.createWorkingTask({
        agentId: TEST_AGENT_PRINCIPAL.agentId,
        ownerId: TEST_AGENT_PRINCIPAL.ownerId,
        now,
        ttlMs: 10,
      });

      assert.ok(
        await store.getDetailedTask(
          TEST_AGENT_PRINCIPAL.agentId,
          created.taskId,
          now + 5,
        ),
      );
      const expired = await catchLookup(() =>
        store.getDetailedTask(
          TEST_AGENT_PRINCIPAL.agentId,
          created.taskId,
          now + 11,
        ),
      );
      assert.equal(expired.reason, "expired");
    } finally {
      await close();
    }
  });

  it("applies inputResponses and ignores unknown or already-satisfied keys", async () => {
    const { store, close } = await createStore();
    try {
      const created = await store.createWorkingTask({
        agentId: TEST_AGENT_PRINCIPAL.agentId,
        ownerId: TEST_AGENT_PRINCIPAL.ownerId,
      });
      await store.requireInput(created.taskId, {
        name: { method: "elicitation/create", params: {} },
        extra: { method: "elicitation/create", params: {} },
      });

      await store.applyInputResponses(TEST_AGENT_PRINCIPAL.agentId, created.taskId, {
        name: { action: "accept" },
        unknown: { action: "accept" },
      });

      const afterPartial = await store.getDetailedTask(
        TEST_AGENT_PRINCIPAL.agentId,
        created.taskId,
      );
      assert.equal(afterPartial.status, "input_required");
      assert.deepEqual(Object.keys(afterPartial.inputRequests ?? {}), ["extra"]);

      await store.applyInputResponses(TEST_AGENT_PRINCIPAL.agentId, created.taskId, {
        name: { action: "accept" },
        extra: { action: "accept" },
      });
      const afterAll = await store.getDetailedTask(
        TEST_AGENT_PRINCIPAL.agentId,
        created.taskId,
      );
      assert.equal(afterAll.status, "working");
    } finally {
      await close();
    }
  });

  it("cancels a working task and no-ops a terminal cancel", async () => {
    const { store, close } = await createStore();
    try {
      const created = await store.createWorkingTask({
        agentId: TEST_AGENT_PRINCIPAL.agentId,
        ownerId: TEST_AGENT_PRINCIPAL.ownerId,
      });
      await store.requestCancel(TEST_AGENT_PRINCIPAL.agentId, created.taskId);
      const cancelled = await store.getDetailedTask(
        TEST_AGENT_PRINCIPAL.agentId,
        created.taskId,
      );
      assert.equal(cancelled.status, "cancelled");

      await store.requestCancel(TEST_AGENT_PRINCIPAL.agentId, created.taskId);
      assert.equal(
        (await store.getDetailedTask(TEST_AGENT_PRINCIPAL.agentId, created.taskId))
          .status,
        "cancelled",
      );
    } finally {
      await close();
    }
  });

  it("completes with isError true rather than failing", async () => {
    const { store, close } = await createStore();
    try {
      const created = await store.createWorkingTask({
        agentId: TEST_AGENT_PRINCIPAL.agentId,
        ownerId: TEST_AGENT_PRINCIPAL.ownerId,
      });
      await store.complete(created.taskId, {
        content: [{ type: "text", text: "denied" }],
        isError: true,
      });
      const got = await store.getDetailedTask(
        TEST_AGENT_PRINCIPAL.agentId,
        created.taskId,
      );
      assert.equal(got.status, "completed");
      assert.equal(
        (got as { result?: { isError?: boolean } }).result?.isError,
        true,
      );
    } finally {
      await close();
    }
  });

  it("attaches a backend origin without exposing it on the wire task", async () => {
    const { store, close } = await createStore();
    try {
      const created = await store.createWorkingTask({
        agentId: TEST_AGENT_PRINCIPAL.agentId,
        ownerId: TEST_AGENT_PRINCIPAL.ownerId,
      });
      const attached = await store.attachBackendOrigin(created.taskId, {
        server: "github",
        backendTaskId: "same-id-from-two-backends",
        pollIntervalMs: 100,
        statusMessage: "Waiting on github task",
      });
      assert.equal(attached?.backendServer, "github");
      assert.equal(attached?.backendTaskId, "same-id-from-two-backends");

      const stored = await store.requireOwnedTask(
        TEST_AGENT_PRINCIPAL.agentId,
        created.taskId,
      );
      assert.equal(stored.backendServer, "github");
      assert.equal(stored.pollIntervalMs, 100);

      const wire = await store.getDetailedTask(
        TEST_AGENT_PRINCIPAL.agentId,
        created.taskId,
      );
      assert.equal(wire.taskId, created.taskId);
      assert.equal(
        (wire as { backendTaskId?: string }).backendTaskId,
        undefined,
      );
      assert.equal(wire.pollIntervalMs, 100);
      assert.equal(wire.statusMessage, "Waiting on github task");
    } finally {
      await close();
    }
  });

  it("refuses to attach a backend origin to a terminal task", async () => {
    const { store, close } = await createStore();
    try {
      const created = await store.createWorkingTask({
        agentId: TEST_AGENT_PRINCIPAL.agentId,
        ownerId: TEST_AGENT_PRINCIPAL.ownerId,
      });
      await store.requestCancel(TEST_AGENT_PRINCIPAL.agentId, created.taskId);

      const attached = await store.attachBackendOrigin(created.taskId, {
        server: "github",
        backendTaskId: "orphan",
      });

      assert.equal(attached, undefined);
      const stored = await store.requireOwnedTask(
        TEST_AGENT_PRINCIPAL.agentId,
        created.taskId,
      );
      assert.equal(stored.status, "cancelled");
      assert.equal(stored.backendTaskId, undefined);
    } finally {
      await close();
    }
  });

  it("returns undefined when attaching to an unknown task", async () => {
    const { store, close } = await createStore();
    try {
      assert.equal(
        await store.attachBackendOrigin("does-not-exist", {
          server: "github",
          backendTaskId: "orphan",
        }),
        undefined,
      );
    } finally {
      await close();
    }
  });
});
