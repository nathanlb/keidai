import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AgentRegistrationConfig } from "@keidai/shared";
import { buildBearerAgentRegistry } from "../build-bearer-agent-registry.js";

const registrations: AgentRegistrationConfig[] = [
  {
    subject: {
      kind: "k8s_service_account",
      namespace: "torii-agents",
      service_account: "demo-agent",
    },
    agent_id: "demo-agent-01",
    owner_id: "demo-owner",
    groups: ["agents"],
    inbound_token: "demo-agent-bearer",
  },
  {
    subject: {
      kind: "k8s_service_account",
      namespace: "torii-agents",
      service_account: "catalog-agent",
    },
    agent_id: "agent-catalog-01",
    owner_id: "user-alice",
    groups: ["agents"],
  },
];

describe("buildBearerAgentRegistry", () => {
  it("maps inbound_token values to agent principals", () => {
    const registry = buildBearerAgentRegistry(registrations);
    const principal = registry.get("demo-agent-bearer");

    assert.ok(principal);
    assert.deepEqual(principal, {
      agentId: "demo-agent-01",
      ownerId: "demo-owner",
      groups: ["agents"],
    });
    assert.equal(registry.size, 1);
  });
});
