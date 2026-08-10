import "reflect-metadata";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ToriiConfig } from "@keidai/shared";
import { ToriiConfigService } from "../../config/torii-config.service.js";
import { TEST_AGENT_PRINCIPAL } from "../../identity/tests/test-helpers.js";
import { ApprovalGateService, ApprovalReplayError } from "../approval-gate.service.js";
import { ApprovalStoreService } from "../approval-store.service.js";
import { ApprovalReadService } from "../approval-read.service.js";
import {
  hashToolParams,
  parseToolArguments,
} from "../utils/approval-tool-args.js";

function createGate(gatedTools: NonNullable<ToriiConfig["gated_tools"]>) {
  const configService = new ToriiConfigService({
    oauth_providers: {},
    servers: [],
    gated_tools: gatedTools,
  });
  const store = new ApprovalStoreService();
  const gate = new ApprovalGateService(configService, store);
  const read = new ApprovalReadService(store);
  return { gate, store, read };
}

const gatedTools = {
  [TEST_AGENT_PRINCIPAL.agentId]: ["gmail.create_draft"],
};

describe("approval ledger", () => {
  it("requires approval for tools listed under the agent id", () => {
    const { gate } = createGate(gatedTools);

    assert.equal(
      gate.requiresApproval(TEST_AGENT_PRINCIPAL, "gmail.create_draft"),
      true,
    );
    assert.equal(
      gate.requiresApproval(TEST_AGENT_PRINCIPAL, "gmail.search"),
      false,
    );
  });

  it("returns approval_required for gated calls", () => {
    const { gate } = createGate(gatedTools);

    const result = gate.interceptGatedCall({
      principal: TEST_AGENT_PRINCIPAL,
      toolName: "gmail.create_draft",
      upstreamArgs: { subject: "Hello" },
    });

    assert.equal(result.isError, false);
    const textPart = result.content?.find((part) => part.type === "text");
    const payload = JSON.parse(
      textPart && "text" in textPart ? textPart.text : "{}",
    );
    assert.equal(payload.status, "approval_required");
    assert.equal(typeof payload.approval_id, "string");
  });

  it("auto-denies repeat calls matching a recently rejected params hash", () => {
    const { gate, store } = createGate(gatedTools);

    const params = { subject: "Hello" };
    const approval = store.createPendingApproval({
      principal: TEST_AGENT_PRINCIPAL,
      toolName: "gmail.create_draft",
      params,
      paramsHash: hashToolParams(params),
    });
    store.reject(approval.id, "not now");

    const result = gate.interceptGatedCall({
      principal: TEST_AGENT_PRINCIPAL,
      toolName: "gmail.create_draft",
      upstreamArgs: params,
    });

    const textPart = result.content?.find((part) => part.type === "text");
    const payload = JSON.parse(
      textPart && "text" in textPart ? textPart.text : "{}",
    );
    assert.equal(payload.status, "approval_denied");
    assert.equal(payload.reason, "not now");
  });

  it("round-trips opaque runId and stepId unmodified and uninterpreted", () => {
    const { gate, read } = createGate(gatedTools);
    const runId = "opaque-run-ref-≠-uuid";
    const stepId = "opaque-step/ref with spaces";

    const result = gate.interceptGatedCall({
      principal: TEST_AGENT_PRINCIPAL,
      toolName: "gmail.create_draft",
      upstreamArgs: { subject: "Hello" },
      runId,
      stepId,
    });

    const textPart = result.content?.find((part) => part.type === "text");
    const payload = JSON.parse(
      textPart && "text" in textPart ? textPart.text : "{}",
    );
    const view = read.getApproval(payload.approval_id);
    assert.equal(view?.runId, runId);
    assert.equal(view?.stepId, stepId);
  });

  it("strips correlation meta-args before hashing upstream params", () => {
    const parsed = parseToolArguments({
      subject: "Hello",
      approval_id: "should-strip",
      _torii_run_id: "run-1",
      _torii_step_id: "step-1",
    });

    assert.deepEqual(parsed.upstreamArgs, { subject: "Hello" });
    assert.equal(parsed.approvalId, "should-strip");
    assert.equal(parsed.runId, "run-1");
    assert.equal(parsed.stepId, "step-1");
    assert.equal(
      hashToolParams(parsed.upstreamArgs),
      hashToolParams({ subject: "Hello" }),
    );
  });

  it("cancels a pending approval without adding rejection suppression", () => {
    const { gate, store } = createGate(gatedTools);
    const params = { subject: "Hello" };

    const pending = store.createPendingApproval({
      principal: TEST_AGENT_PRINCIPAL,
      toolName: "gmail.create_draft",
      params,
      paramsHash: hashToolParams(params),
    });

    const cancelled = store.cancel(pending.id);
    assert.equal(cancelled?.status, "cancelled");

    const repeat = gate.interceptGatedCall({
      principal: TEST_AGENT_PRINCIPAL,
      toolName: "gmail.create_draft",
      upstreamArgs: params,
    });

    const textPart = repeat.content?.find((part) => part.type === "text");
    const payload = JSON.parse(
      textPart && "text" in textPart ? textPart.text : "{}",
    );
    assert.equal(payload.status, "approval_required");
  });

  it("validates params hash and single-use consumption on replay", () => {
    const { gate, store } = createGate(gatedTools);
    const params = { subject: "Hello" };

    const pending = store.createPendingApproval({
      principal: TEST_AGENT_PRINCIPAL,
      toolName: "gmail.create_draft",
      params,
      paramsHash: hashToolParams(params),
    });
    store.approve(pending.id);

    assert.throws(
      () =>
        gate.validateReplay({
          approvalId: pending.id,
          principal: TEST_AGENT_PRINCIPAL,
          toolName: "gmail.create_draft",
          upstreamArgs: { subject: "Different" },
        }),
      (error: unknown) =>
        error instanceof ApprovalReplayError &&
        error.message === "approval params mismatch",
    );

    gate.validateReplay({
      approvalId: pending.id,
      principal: TEST_AGENT_PRINCIPAL,
      toolName: "gmail.create_draft",
      upstreamArgs: params,
    });
    gate.markReplayUsed(pending.id);

    assert.throws(
      () =>
        gate.validateReplay({
          approvalId: pending.id,
          principal: TEST_AGENT_PRINCIPAL,
          toolName: "gmail.create_draft",
          upstreamArgs: params,
        }),
      (error: unknown) =>
        error instanceof ApprovalReplayError &&
        error.message === "approval already used",
    );
  });
});
