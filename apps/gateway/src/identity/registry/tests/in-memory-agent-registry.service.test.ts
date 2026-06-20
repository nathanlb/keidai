import "reflect-metadata";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AgentPrincipal } from "@torii/shared";
import { InMemoryAgentRegistry } from "../in-memory-agent-registry.service.js";
import { IdentityResolutionError } from "../../types/identity-resolution-error.js";
import type { ValidatedAgentSubject } from "../../types/validated-agent-subject.js";

const REGISTERED_SUBJECT: ValidatedAgentSubject = {
  kind: "k8s_service_account",
  namespace: "torii-agents",
  serviceAccountName: "catalog-agent",
};

const REGISTERED_PRINCIPAL: AgentPrincipal = {
  agentId: "agent-catalog-01",
  ownerId: "user-alice",
  groups: ["agents"],
};

function createRegistry(
  entries: Array<[string, AgentPrincipal]> = [
    [`${REGISTERED_SUBJECT.namespace}/${REGISTERED_SUBJECT.serviceAccountName}`, REGISTERED_PRINCIPAL],
  ],
): InMemoryAgentRegistry {
  return new InMemoryAgentRegistry(new Map(entries));
}

describe("InMemoryAgentRegistry", () => {
  it("resolves a registered subject to its agentId, ownerId, and groups", () => {
    const registry = createRegistry();
    const principal = registry.lookup(REGISTERED_SUBJECT);

    assert.deepEqual(principal, REGISTERED_PRINCIPAL);
  });

  it("rejects an unregistered subject with a clean error", () => {
    const registry = createRegistry();

    assert.throws(
      () =>
        registry.lookup({
          kind: "k8s_service_account",
          namespace: "torii-agents",
          serviceAccountName: "unknown-agent",
        }),
      (error: unknown) => {
        assert.ok(error instanceof IdentityResolutionError);
        assert.equal(error.message, "Agent is not registered");
        return true;
      },
    );
  });

  it("keeps ownership fixed at registration and does not derive ownerId from the subject", () => {
    const registry = createRegistry();
    const first = registry.lookup(REGISTERED_SUBJECT);
    const second = registry.lookup(REGISTERED_SUBJECT);

    assert.equal(first.ownerId, "user-alice");
    assert.equal(second.ownerId, "user-alice");
    assert.notEqual(first, second);
    assert.throws(() => {
      (first as { ownerId: string }).ownerId = "request-user";
    });
    assert.equal(registry.lookup(REGISTERED_SUBJECT).ownerId, "user-alice");
  });
});
