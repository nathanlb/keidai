import "reflect-metadata";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TEST_AGENT_PRINCIPAL } from "../../identity/tests/test-helpers.js";
import { createTestGatewayPersistence } from "../../testing/gateway-persistence.js";
import { ApprovalStoreService } from "../approval-store.service.js";
import { hashToolParams } from "../utils/approval-tool-args.js";

describe("ApprovalStoreService postgres persistence", () => {
  it("binds a pending approval to a task id across store instances", async () => {
    const persistence = await createTestGatewayPersistence("postgres");
    assert.ok(persistence.pool);
    assert.ok(persistence.approvalStore);

    try {
      const params = { subject: "Hello" };
      const pending = await persistence.approvalStore.createPendingApproval({
        principal: TEST_AGENT_PRINCIPAL,
        toolName: "gmail.create_draft",
        params,
        paramsHash: hashToolParams(params),
        taskId: "task-from-gate",
      });

      const reopened = new ApprovalStoreService(persistence.pool);
      const byTask = await reopened.getApprovalByTaskId("task-from-gate");
      assert.equal(byTask?.id, pending.id);
      assert.equal(byTask?.taskId, "task-from-gate");
    } finally {
      await persistence.close();
    }
  });

  it("survives process restart so a pending approval can still be approved", async () => {
    const persistence = await createTestGatewayPersistence("postgres");
    assert.ok(persistence.pool);
    assert.ok(persistence.approvalStore);

    try {
      const params = { subject: "Hello" };
      const pending = await persistence.approvalStore.createPendingApproval({
        principal: TEST_AGENT_PRINCIPAL,
        toolName: "gmail.create_draft",
        params,
        paramsHash: hashToolParams(params),
      });

      const reopened = new ApprovalStoreService(persistence.pool);
      const approved = await reopened.approve(pending.id);
      assert.equal(approved?.status, "approved");
      assert.equal(approved?.id, pending.id);
      assert.equal(approved?.paramsHash, pending.paramsHash);
    } finally {
      await persistence.close();
    }
  });

  it("shares the ledger including rejection suppression across store instances", async () => {
    const persistence = await createTestGatewayPersistence("postgres");
    assert.ok(persistence.pool);
    assert.ok(persistence.approvalStore);

    try {
      const params = { subject: "Hello" };
      const pending = await persistence.approvalStore.createPendingApproval({
        principal: TEST_AGENT_PRINCIPAL,
        toolName: "gmail.create_draft",
        params,
        paramsHash: hashToolParams(params),
      });
      await persistence.approvalStore.reject(pending.id, "not now");

      const peer = new ApprovalStoreService(persistence.pool);
      const suppressed = await peer.findRecentRejection({
        agentId: TEST_AGENT_PRINCIPAL.agentId,
        toolName: "gmail.create_draft",
        paramsHash: hashToolParams(params),
      });
      assert.equal(suppressed?.rejectionReason, "not now");

      const listed = await peer.listApprovals("rejected");
      assert.equal(listed.length, 1);
      assert.equal(listed[0]?.id, pending.id);
    } finally {
      await persistence.close();
    }
  });

  it("enforces single-use marking under concurrent markUsed attempts", async () => {
    const persistence = await createTestGatewayPersistence("postgres");
    assert.ok(persistence.pool);
    assert.ok(persistence.approvalStore);

    try {
      const params = { subject: "Hello" };
      const pending = await persistence.approvalStore.createPendingApproval({
        principal: TEST_AGENT_PRINCIPAL,
        toolName: "gmail.create_draft",
        params,
        paramsHash: hashToolParams(params),
      });
      await persistence.approvalStore.approve(pending.id);

      const peer = new ApprovalStoreService(persistence.pool);
      const first = await persistence.approvalStore.markUsed(pending.id, 1_000);
      const second = await peer.markUsed(pending.id, 2_000);

      const winners = [first, second].filter(Boolean);
      assert.equal(winners.length, 1);
      assert.equal(winners[0]?.usedAt, 1_000);

      const stored = await peer.getApproval(pending.id);
      assert.equal(stored?.usedAt, 1_000);
    } finally {
      await persistence.close();
    }
  });

  it("expires pending decisions by query rather than process lifetime", async () => {
    const persistence = await createTestGatewayPersistence("postgres");
    assert.ok(persistence.approvalStore);
    const store = persistence.approvalStore;

    try {
      const now = 1_000_000;
      const pending = await store.createPendingApproval({
        principal: TEST_AGENT_PRINCIPAL,
        toolName: "gmail.create_draft",
        params: { subject: "Hello" },
        paramsHash: hashToolParams({ subject: "Hello" }),
        now,
        ttlMs: 10,
      });

      assert.equal(await store.approve(pending.id, now + 11), undefined);
      assert.equal((await store.getApproval(pending.id))?.status, "pending");
      assert.ok(await store.approve(pending.id, now + 5));
    } finally {
      await persistence.close();
    }
  });
});
