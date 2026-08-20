import "reflect-metadata";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TEST_AGENT_PRINCIPAL } from "../../../identity/tests/test-helpers.js";
import { createTestGatewayPersistence } from "../../../testing/gateway-persistence.js";
import { resolveCoveredTaskIds } from "../dispatch-mcp-subscriptions.js";

describe("resolveCoveredTaskIds", () => {
  it("acks only tasks owned by the calling agent", async () => {
    const persistence = await createTestGatewayPersistence("postgres");
    assert.ok(persistence.taskStore);
    try {
      const owned = await persistence.taskStore.createWorkingTask({
        agentId: TEST_AGENT_PRINCIPAL.agentId,
        ownerId: TEST_AGENT_PRINCIPAL.ownerId,
      });
      const foreign = await persistence.taskStore.createWorkingTask({
        agentId: "other-agent",
        ownerId: TEST_AGENT_PRINCIPAL.ownerId,
      });

      const covered = await resolveCoveredTaskIds({
        principal: TEST_AGENT_PRINCIPAL,
        requested: [owned.taskId, foreign.taskId, "missing-task"],
        taskStore: persistence.taskStore,
      });

      assert.deepEqual(covered, [owned.taskId]);
    } finally {
      await persistence.close();
    }
  });
});
