import "reflect-metadata";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ToriiConfig } from "@keidai/shared";
import { TEST_AGENT_PRINCIPAL } from "../../identity/tests/test-helpers.js";
import { createTestGatewayPersistence } from "../../testing/gateway-persistence.js";
import { ApprovalGateService } from "../approval-gate.service.js";
import { ApprovalReadService } from "../approval-read.service.js";
import { groupPolicyCacheFromConfig } from "./test-helpers.js";
import {
  hashToolParams,
  parseToolArguments,
} from "../utils/approval-tool-args.js";

async function createGate(gatedTools: NonNullable<ToriiConfig["gated_tools"]>) {
  const cache = groupPolicyCacheFromConfig({
    oauth_providers: {},
    servers: [],
    gated_tools: gatedTools,
  });
  const persistence = await createTestGatewayPersistence("postgres");
  const store = persistence.approvalStore!;
  const taskStore = persistence.taskStore!;
  const gate = new ApprovalGateService(cache, store, taskStore);
  const read = new ApprovalReadService(store);
  return { gate, store, taskStore, read, close: persistence.close };
}

const gatedTools = {
  [TEST_AGENT_PRINCIPAL.agentId]: ["gmail.create_draft"],
};

describe("approval ledger", () => {
  it("requires approval for tools listed under the agent id", async () => {
    const { gate, close } = await createGate(gatedTools);
    try {
      assert.equal(
        gate.requiresApproval(TEST_AGENT_PRINCIPAL, "gmail.create_draft"),
        true,
      );
      assert.equal(
        gate.requiresApproval(TEST_AGENT_PRINCIPAL, "gmail.search"),
        false,
      );
    } finally {
      await close();
    }
  });

  it("parks a gated call as a working task and a pending approval", async () => {
    const { gate, store, taskStore, close } = await createGate(gatedTools);
    try {
      const outcome = await gate.interceptGatedCall({
        principal: TEST_AGENT_PRINCIPAL,
        toolName: "gmail.create_draft",
        upstreamArgs: { subject: "Hello" },
      });

      assert.equal(outcome.kind, "parked");
      if (outcome.kind !== "parked") {
        return;
      }
      assert.equal(outcome.task.resultType, "task");
      assert.equal(outcome.task.status, "working");
      assert.match(outcome.task.statusMessage ?? "", /Awaiting operator approval/);
      assert.equal(typeof outcome.task.ttlMs, "number");
      assert.equal(typeof outcome.task.pollIntervalMs, "number");

      const approval = await store.getApprovalByTaskId(outcome.task.taskId);
      assert.equal(approval?.status, "pending");
      assert.equal(approval?.toolName, "gmail.create_draft");
      assert.deepEqual(approval?.params, { subject: "Hello" });
      assert.equal(
        (
          await taskStore.getDetailedTask(
            TEST_AGENT_PRINCIPAL.agentId,
            outcome.task.taskId,
          )
        ).status,
        "working",
      );
    } finally {
      await close();
    }
  });

  it("auto-denies repeat calls matching a recently rejected params hash", async () => {
    const { gate, store, close } = await createGate(gatedTools);
    try {
      const params = { subject: "Hello" };
      const approval = await store.createPendingApproval({
        principal: TEST_AGENT_PRINCIPAL,
        toolName: "gmail.create_draft",
        params,
        paramsHash: hashToolParams(params),
      });
      await store.reject(approval.id, "not now");

      const outcome = await gate.interceptGatedCall({
        principal: TEST_AGENT_PRINCIPAL,
        toolName: "gmail.create_draft",
        upstreamArgs: params,
      });

      assert.equal(outcome.kind, "denied");
      if (outcome.kind !== "denied") {
        return;
      }
      const textPart = outcome.result.content?.find((part) => part.type === "text");
      const payload = JSON.parse(
        textPart && "text" in textPart ? textPart.text : "{}",
      );
      assert.equal(payload.status, "approval_denied");
      assert.equal(payload.reason, "not now");
    } finally {
      await close();
    }
  });

  it("round-trips opaque runId and stepId unmodified and uninterpreted", async () => {
    const { gate, read, store, close } = await createGate(gatedTools);
    try {
      const runId = "opaque-run-ref-≠-uuid";
      const stepId = "opaque-step/ref with spaces";

      const outcome = await gate.interceptGatedCall({
        principal: TEST_AGENT_PRINCIPAL,
        toolName: "gmail.create_draft",
        upstreamArgs: { subject: "Hello" },
        runId,
        stepId,
      });

      assert.equal(outcome.kind, "parked");
      if (outcome.kind !== "parked") {
        return;
      }
      const approval = await store.getApprovalByTaskId(outcome.task.taskId);
      assert.ok(approval);
      const view = await read.getApproval(approval.id);
      assert.equal(view?.runId, runId);
      assert.equal(view?.stepId, stepId);
    } finally {
      await close();
    }
  });

  it("strips correlation meta-args before hashing upstream params", () => {
    const parsed = parseToolArguments({
      subject: "Hello",
      _torii_run_id: "run-1",
      _torii_step_id: "step-1",
    });

    assert.deepEqual(parsed.upstreamArgs, { subject: "Hello" });
    assert.equal(parsed.runId, "run-1");
    assert.equal(parsed.stepId, "step-1");
    assert.equal(
      hashToolParams(parsed.upstreamArgs),
      hashToolParams({ subject: "Hello" }),
    );
  });

  it("cancels a pending approval without adding rejection suppression", async () => {
    const { gate, store, close } = await createGate(gatedTools);
    try {
      const params = { subject: "Hello" };

      const pending = await store.createPendingApproval({
        principal: TEST_AGENT_PRINCIPAL,
        toolName: "gmail.create_draft",
        params,
        paramsHash: hashToolParams(params),
      });

      const cancelled = await store.cancel(pending.id);
      assert.equal(cancelled?.status, "cancelled");

      const repeat = await gate.interceptGatedCall({
        principal: TEST_AGENT_PRINCIPAL,
        toolName: "gmail.create_draft",
        upstreamArgs: params,
      });

      assert.equal(repeat.kind, "parked");
    } finally {
      await close();
    }
  });

  it("claims an approved task for execution exactly once", async () => {
    const { gate, store, close } = await createGate(gatedTools);
    try {
      const parked = await gate.interceptGatedCall({
        principal: TEST_AGENT_PRINCIPAL,
        toolName: "gmail.create_draft",
        upstreamArgs: { subject: "Hello" },
      });
      assert.equal(parked.kind, "parked");
      if (parked.kind !== "parked") {
        return;
      }

      const approval = await store.getApprovalByTaskId(parked.task.taskId);
      assert.ok(approval);
      await store.approve(approval.id);

      const first = await gate.claimApprovedExecution(
        parked.task.taskId,
        TEST_AGENT_PRINCIPAL,
      );
      const second = await gate.claimApprovedExecution(
        parked.task.taskId,
        TEST_AGENT_PRINCIPAL,
      );
      assert.ok(first);
      assert.equal(second, undefined);
    } finally {
      await close();
    }
  });
});
