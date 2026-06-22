import "reflect-metadata";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CompositeAgentIdentityResolver } from "../../resolvers/composite-agent-identity-resolver.service.js";
import { FixedIdentityResolver } from "../../tests/test-helpers.js";

describe("CompositeAgentIdentityResolver", () => {
  it("resolves config-declared inbound bearer tokens", async () => {
    const principal = {
      agentId: "demo-agent-01",
      ownerId: "demo-owner",
      groups: ["agents"],
    };
    const resolver = new CompositeAgentIdentityResolver(
      new Map([["demo-agent-bearer", principal]]),
      null,
    );

    const resolved = await resolver.resolve("demo-agent-bearer");
    assert.deepEqual(resolved, principal);
  });

  it("falls through to the k8s resolver when bearer lookup misses", async () => {
    const k8sPrincipal = {
      agentId: "agent-catalog-01",
      ownerId: "user-alice",
      groups: ["agents"],
    };
    const k8sResolver = new FixedIdentityResolver(k8sPrincipal);
    const resolver = new CompositeAgentIdentityResolver(
      new Map(),
      k8sResolver,
    );

    const resolved = await resolver.resolve("ignored-jwt");
    assert.deepEqual(resolved, k8sPrincipal);
  });

  it("rejects unknown credentials when no k8s resolver is configured", async () => {
    const resolver = new CompositeAgentIdentityResolver(new Map(), null);

    await assert.rejects(
      () => resolver.resolve("unknown-token"),
      /Invalid agent credential/,
    );
  });
});
