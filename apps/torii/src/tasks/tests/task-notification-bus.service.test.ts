import "reflect-metadata";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TEST_AGENT_PRINCIPAL } from "../../identity/tests/test-helpers.js";
import { createTestGatewayPersistence } from "../../testing/gateway-persistence.js";
import { TaskNotificationBus } from "../task-notification-bus.service.js";
import { TaskStoreService } from "../task-store.service.js";

function waitFor(
  check: () => boolean,
  timeoutMs = 2_000,
): Promise<void> {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const poll = (): void => {
      if (check()) {
        resolve();
        return;
      }
      if (Date.now() - started >= timeoutMs) {
        reject(new Error("timed out waiting for task notification"));
        return;
      }
      setTimeout(poll, 10);
    };
    poll();
  });
}

describe("TaskNotificationBus", () => {
  it("delivers a status change published from another store on the same database", async () => {
    const persistence = await createTestGatewayPersistence("postgres");
    assert.ok(persistence.pool);
    assert.ok(persistence.taskStore);
    const bus = new TaskNotificationBus(persistence.pool);
    const publisher = new TaskStoreService(persistence.pool);
    try {
      const created = await persistence.taskStore.createWorkingTask({
        agentId: TEST_AGENT_PRINCIPAL.agentId,
        ownerId: TEST_AGENT_PRINCIPAL.ownerId,
      });
      const seen: string[] = [];
      const unsubscribe = await bus.subscribe(new Set([created.taskId]), (taskId) => {
        seen.push(taskId);
      });
      try {
        await publisher.complete(created.taskId, {
          content: [{ type: "text", text: "ok" }],
          isError: false,
        });
        await waitFor(() => seen.includes(created.taskId));
        assert.deepEqual(seen, [created.taskId]);
      } finally {
        unsubscribe();
      }
    } finally {
      await bus.close();
      await persistence.close();
    }
  });
});
