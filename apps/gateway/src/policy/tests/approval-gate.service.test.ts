import "reflect-metadata";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ToriiConfig } from "@keidai/shared";
import { APPROVAL_REQUIRED_STATUS } from "@keidai/shared";
import { ToriiConfigService } from "../../config/torii-config.service.js";
import { STUB_AGENT_PRINCIPAL } from "../../identity/stub-agent-principal.js";
import { ApprovalGateService } from "../approval-gate.service.js";
import { ApprovalStoreService } from "../approval-store.service.js";
import { hashToolParams } from "../utils/approval-tool-args.js";

function createGate(agents: NonNullable<ToriiConfig["agents"]>) {
  const configService = new ToriiConfigService({
    oauth_providers: {},
    servers: [],
    agents,
  });
  const store = new ApprovalStoreService();
  const gate = new ApprovalGateService(configService, store);
  return { gate, store };
}

describe("approval gate", () => {
  it("requires approval for tools listed on the agent registration", () => {
    const { gate } = createGate([
      {
        subject: {
          kind: "k8s_service_account",
          namespace: "torii-agents",
          service_account: "demo",
        },
        agent_id: STUB_AGENT_PRINCIPAL.agentId,
        owner_id: STUB_AGENT_PRINCIPAL.ownerId,
        groups: [],
        gated_tools: ["gmail.create_draft"],
      },
    ]);

    assert.equal(
      gate.requiresApproval(STUB_AGENT_PRINCIPAL, "gmail.create_draft"),
      true,
    );
    assert.equal(
      gate.requiresApproval(STUB_AGENT_PRINCIPAL, "gmail.search"),
      false,
    );
  });

  it("returns approval_required for gated calls", () => {
    const { gate } = createGate([
      {
        subject: {
          kind: "k8s_service_account",
          namespace: "torii-agents",
          service_account: "demo",
        },
        agent_id: STUB_AGENT_PRINCIPAL.agentId,
        owner_id: STUB_AGENT_PRINCIPAL.ownerId,
        groups: [],
        gated_tools: ["gmail.create_draft"],
      },
    ]);

    const result = gate.interceptGatedCall({
      principal: STUB_AGENT_PRINCIPAL,
      toolName: "gmail.create_draft",
      upstreamArgs: { subject: "Hello" },
    });

    assert.equal(result.isError, false);
    const textPart = result.content?.find((part) => part.type === "text");
    const payload = JSON.parse(
      textPart && "text" in textPart ? textPart.text : "{}",
    );
    assert.equal(payload.status, APPROVAL_REQUIRED_STATUS);
    assert.equal(typeof payload.approval_id, "string");
  });

  it("auto-denies repeat calls matching a recently rejected params hash", () => {
    const { gate, store } = createGate([
      {
        subject: {
          kind: "k8s_service_account",
          namespace: "torii-agents",
          service_account: "demo",
        },
        agent_id: STUB_AGENT_PRINCIPAL.agentId,
        owner_id: STUB_AGENT_PRINCIPAL.ownerId,
        groups: [],
        gated_tools: ["gmail.create_draft"],
      },
    ]);

    const params = { subject: "Hello" };
    const approval = store.createPendingApproval({
      principal: STUB_AGENT_PRINCIPAL,
      toolName: "gmail.create_draft",
      params,
      paramsHash: hashToolParams(params),
    });
    store.reject(approval.id, "not now");

    const result = gate.interceptGatedCall({
      principal: STUB_AGENT_PRINCIPAL,
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
});
