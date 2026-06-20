import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AgentRegistrationConfig } from "@torii/shared";
import { buildAgentRegistry } from "../build-agent-registry.js";

const registrations: AgentRegistrationConfig[] = [
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

describe("buildAgentRegistry", () => {
  it("builds a registry from boot-time agent registrations", () => {
    const registry = buildAgentRegistry(registrations);
    const principal = registry.lookup({
      kind: "k8s_service_account",
      namespace: "torii-agents",
      serviceAccountName: "catalog-agent",
    });

    assert.deepEqual(principal, {
      agentId: "agent-catalog-01",
      ownerId: "user-alice",
      groups: ["agents"],
    });
  });
});
