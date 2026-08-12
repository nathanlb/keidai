import "reflect-metadata";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TEST_AGENT_PRINCIPAL } from "../../identity/tests/test-helpers.js";
import { openGatewayDatabase } from "../../storage/gateway-sqlite.js";
import {
  createTestGatewayPersistence,
} from "../../testing/gateway-persistence.js";
import { ApprovalStoreService } from "../approval-store.service.js";
import { hashToolParams } from "../utils/approval-tool-args.js";

describe("ApprovalStoreService sqlite persistence", () => {
  it("survives process restart so a pending approval can still be approved", () => {
    const persistence = createTestGatewayPersistence("sqlite");
    assert.ok(persistence.databasePath);
    assert.ok(persistence.approvalStore);

    const params = { subject: "Hello" };
    const pending = persistence.approvalStore.createPendingApproval({
      principal: TEST_AGENT_PRINCIPAL,
      toolName: "gmail.create_draft",
      params,
      paramsHash: hashToolParams(params),
    });
    persistence.close();

    const reopenedDb = openGatewayDatabase(persistence.databasePath);
    const reopened = new ApprovalStoreService(reopenedDb);
    try {
      const approved = reopened.approve(pending.id);
      assert.equal(approved?.status, "approved");
      assert.equal(approved?.id, pending.id);
      assert.equal(approved?.paramsHash, pending.paramsHash);
    } finally {
      reopenedDb.close();
    }
  });

  it("shares the ledger including rejection suppression across store instances", () => {
    const persistence = createTestGatewayPersistence("sqlite");
    assert.ok(persistence.databasePath);
    assert.ok(persistence.approvalStore);

    const params = { subject: "Hello" };
    const pending = persistence.approvalStore.createPendingApproval({
      principal: TEST_AGENT_PRINCIPAL,
      toolName: "gmail.create_draft",
      params,
      paramsHash: hashToolParams(params),
    });
    persistence.approvalStore.reject(pending.id, "not now");

    const peerDb = openGatewayDatabase(persistence.databasePath);
    const peer = new ApprovalStoreService(peerDb);
    try {
      const suppressed = peer.findRecentRejection({
        agentId: TEST_AGENT_PRINCIPAL.agentId,
        toolName: "gmail.create_draft",
        paramsHash: hashToolParams(params),
      });
      assert.equal(suppressed?.rejectionReason, "not now");

      const listed = peer.listApprovals("rejected");
      assert.equal(listed.length, 1);
      assert.equal(listed[0]?.id, pending.id);
    } finally {
      peerDb.close();
      persistence.close();
    }
  });

  it("enforces single-use marking under concurrent markUsed attempts", () => {
    const persistence = createTestGatewayPersistence("sqlite");
    assert.ok(persistence.databasePath);
    assert.ok(persistence.approvalStore);

    const params = { subject: "Hello" };
    const pending = persistence.approvalStore.createPendingApproval({
      principal: TEST_AGENT_PRINCIPAL,
      toolName: "gmail.create_draft",
      params,
      paramsHash: hashToolParams(params),
    });
    persistence.approvalStore.approve(pending.id);

    const peerDb = openGatewayDatabase(persistence.databasePath);
    const peer = new ApprovalStoreService(peerDb);
    try {
      const first = persistence.approvalStore.markUsed(pending.id, 1_000);
      const second = peer.markUsed(pending.id, 2_000);

      const winners = [first, second].filter(Boolean);
      assert.equal(winners.length, 1);
      assert.equal(winners[0]?.usedAt, 1_000);

      const stored = peer.getApproval(pending.id);
      assert.equal(stored?.usedAt, 1_000);
    } finally {
      peerDb.close();
      persistence.close();
    }
  });

  it("expires pending decisions by query rather than process lifetime", () => {
    const persistence = createTestGatewayPersistence("sqlite");
    assert.ok(persistence.approvalStore);
    const store = persistence.approvalStore;

    try {
      const now = 1_000_000;
      const pending = store.createPendingApproval({
        principal: TEST_AGENT_PRINCIPAL,
        toolName: "gmail.create_draft",
        params: { subject: "Hello" },
        paramsHash: hashToolParams({ subject: "Hello" }),
        now,
        ttlMs: 10,
      });

      assert.equal(store.approve(pending.id, now + 11), undefined);
      assert.equal(store.getApproval(pending.id)?.status, "pending");
      assert.ok(store.approve(pending.id, now + 5));
    } finally {
      persistence.close();
    }
  });
});
