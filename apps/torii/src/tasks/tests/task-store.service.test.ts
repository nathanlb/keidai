import "reflect-metadata";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TEST_AGENT_PRINCIPAL } from "../../identity/tests/test-helpers.js";
import { openGatewayDatabase } from "../../storage/gateway-sqlite.js";
import { createTestGatewayPersistence } from "../../testing/gateway-persistence.js";
import { TaskStoreService } from "../task-store.service.js";
import { McpTaskLookupError } from "../types/mcp-task.js";
import { generateMcpTaskId } from "../utils/generate-mcp-task-id.js";

const OTHER_AGENT_ID = "other-agent";

function catchLookup(fn: () => unknown): McpTaskLookupError {
  try {
    fn();
  } catch (error) {
    assert.ok(error instanceof McpTaskLookupError);
    return error;
  }
  assert.fail("expected McpTaskLookupError");
}

function createStore(): {
  store: TaskStoreService;
  close: () => void;
  databasePath: string;
} {
  const persistence = createTestGatewayPersistence("sqlite");
  assert.ok(persistence.databasePath);
  assert.ok(persistence.taskStore);
  return {
    store: persistence.taskStore,
    databasePath: persistence.databasePath,
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

describe("TaskStoreService sqlite persistence", () => {
  it("creates a working task that is readable before CreateTaskResult would be sent", () => {
    const { store, close } = createStore();
    try {
      const created = store.createWorkingTask({
        agentId: TEST_AGENT_PRINCIPAL.agentId,
        ownerId: TEST_AGENT_PRINCIPAL.ownerId,
        statusMessage: "Waiting on approval",
      });
      assert.equal(created.status, "working");
      assert.equal(created.statusMessage, "Waiting on approval");
      assert.equal(typeof created.ttlMs, "number");
      assert.equal(created.pollIntervalMs, 5000);
      assert.match(created.taskId, /^[0-9a-f]{64}$/);

      const got = store.getDetailedTask(
        TEST_AGENT_PRINCIPAL.agentId,
        created.taskId,
      );
      assert.equal(got.taskId, created.taskId);
      assert.equal(got.status, "working");
      assert.equal(got.createdAt, created.createdAt);
    } finally {
      close();
    }
  });

  it("is readable from another store instance sharing the same database", () => {
    const { store, close, databasePath } = createStore();
    try {
      const created = store.createWorkingTask({
        agentId: TEST_AGENT_PRINCIPAL.agentId,
        ownerId: TEST_AGENT_PRINCIPAL.ownerId,
      });

      const peerDb = openGatewayDatabase(databasePath);
      const peer = new TaskStoreService(peerDb);
      try {
        const got = peer.getDetailedTask(
          TEST_AGENT_PRINCIPAL.agentId,
          created.taskId,
        );
        assert.equal(got.taskId, created.taskId);
        assert.equal(got.status, "working");
      } finally {
        peerDb.close();
      }
    } finally {
      close();
    }
  });

  it("survives process restart", () => {
    const { store, close, databasePath } = createStore();
    const created = store.createWorkingTask({
      agentId: TEST_AGENT_PRINCIPAL.agentId,
      ownerId: TEST_AGENT_PRINCIPAL.ownerId,
      statusMessage: "in progress",
    });
    close();

    const reopenedDb = openGatewayDatabase(databasePath);
    const reopened = new TaskStoreService(reopenedDb);
    try {
      const got = reopened.getDetailedTask(
        TEST_AGENT_PRINCIPAL.agentId,
        created.taskId,
      );
      assert.equal(got.taskId, created.taskId);
      assert.equal(got.statusMessage, "in progress");
    } finally {
      reopenedDb.close();
    }
  });

  it("rejects another principal without disclosing that the task exists", () => {
    const { store, close } = createStore();
    try {
      const created = store.createWorkingTask({
        agentId: TEST_AGENT_PRINCIPAL.agentId,
        ownerId: TEST_AGENT_PRINCIPAL.ownerId,
      });

      const otherError = catchLookup(() =>
        store.getDetailedTask(OTHER_AGENT_ID, created.taskId),
      );
      const missingError = catchLookup(() =>
        store.getDetailedTask(TEST_AGENT_PRINCIPAL.agentId, "no-such-task"),
      );

      assert.equal(otherError.reason, "not_found");
      assert.equal(missingError.reason, "not_found");
      assert.equal(otherError.message, missingError.message);
    } finally {
      close();
    }
  });

  it("expires tasks by query rather than process lifetime", () => {
    const { store, close } = createStore();
    try {
      const now = 1_000_000;
      const created = store.createWorkingTask({
        agentId: TEST_AGENT_PRINCIPAL.agentId,
        ownerId: TEST_AGENT_PRINCIPAL.ownerId,
        now,
        ttlMs: 10,
      });

      assert.ok(
        store.getDetailedTask(TEST_AGENT_PRINCIPAL.agentId, created.taskId, now + 5),
      );
      const expired = catchLookup(() =>
        store.getDetailedTask(
          TEST_AGENT_PRINCIPAL.agentId,
          created.taskId,
          now + 11,
        ),
      );
      assert.equal(expired.reason, "expired");
    } finally {
      close();
    }
  });

  it("applies inputResponses and ignores unknown or already-satisfied keys", () => {
    const { store, close } = createStore();
    try {
      const created = store.createWorkingTask({
        agentId: TEST_AGENT_PRINCIPAL.agentId,
        ownerId: TEST_AGENT_PRINCIPAL.ownerId,
      });
      store.requireInput(created.taskId, {
        name: { method: "elicitation/create", params: {} },
        extra: { method: "elicitation/create", params: {} },
      });

      store.applyInputResponses(TEST_AGENT_PRINCIPAL.agentId, created.taskId, {
        name: { action: "accept" },
        unknown: { action: "accept" },
      });

      const afterPartial = store.getDetailedTask(
        TEST_AGENT_PRINCIPAL.agentId,
        created.taskId,
      );
      assert.equal(afterPartial.status, "input_required");
      assert.deepEqual(Object.keys(afterPartial.inputRequests ?? {}), ["extra"]);

      store.applyInputResponses(TEST_AGENT_PRINCIPAL.agentId, created.taskId, {
        name: { action: "accept" },
        extra: { action: "accept" },
      });
      const afterAll = store.getDetailedTask(
        TEST_AGENT_PRINCIPAL.agentId,
        created.taskId,
      );
      assert.equal(afterAll.status, "working");
    } finally {
      close();
    }
  });

  it("cancels a working task and no-ops a terminal cancel", () => {
    const { store, close } = createStore();
    try {
      const created = store.createWorkingTask({
        agentId: TEST_AGENT_PRINCIPAL.agentId,
        ownerId: TEST_AGENT_PRINCIPAL.ownerId,
      });
      store.requestCancel(TEST_AGENT_PRINCIPAL.agentId, created.taskId);
      const cancelled = store.getDetailedTask(
        TEST_AGENT_PRINCIPAL.agentId,
        created.taskId,
      );
      assert.equal(cancelled.status, "cancelled");

      store.requestCancel(TEST_AGENT_PRINCIPAL.agentId, created.taskId);
      assert.equal(
        store.getDetailedTask(TEST_AGENT_PRINCIPAL.agentId, created.taskId)
          .status,
        "cancelled",
      );
    } finally {
      close();
    }
  });

  it("completes with isError true rather than failing", () => {
    const { store, close } = createStore();
    try {
      const created = store.createWorkingTask({
        agentId: TEST_AGENT_PRINCIPAL.agentId,
        ownerId: TEST_AGENT_PRINCIPAL.ownerId,
      });
      store.complete(created.taskId, {
        content: [{ type: "text", text: "denied" }],
        isError: true,
      });
      const got = store.getDetailedTask(
        TEST_AGENT_PRINCIPAL.agentId,
        created.taskId,
      );
      assert.equal(got.status, "completed");
      assert.equal(
        (got as { result?: { isError?: boolean } }).result?.isError,
        true,
      );
    } finally {
      close();
    }
  });
});
