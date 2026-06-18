import "reflect-metadata";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ToriiConfig } from "@torii/shared";
import { ServiceKeyCredentialResolver } from "../service-key-credential-resolver.service.js";

function serviceKeyServer(
  overrides: Partial<Extract<ToriiConfig["servers"][number]["credential"], { strategy: "service_key" }>> = {},
  name = "stripe",
): ToriiConfig["servers"][number] {
  return {
    name,
    transport: { type: "http", url: "https://mcp.stripe.com" },
    credential: {
      strategy: "service_key",
      key: "sk_test_secret_key",
      ...overrides,
    },
    policy: { default: "deny" },
  };
}

describe("ServiceKeyCredentialResolver", () => {
  const resolver = new ServiceKeyCredentialResolver();

  it("injects Authorization Bearer by default", () => {
    const resolved = resolver.resolve(serviceKeyServer());

    assert.equal(
      resolved.headers.Authorization,
      "Bearer sk_test_secret_key",
    );
    assert.equal(resolved.credentialRef, "service_key:stripe");
    assert.doesNotMatch(resolved.credentialRef ?? "", /sk_test_secret_key/);
  });

  it("injects a custom header when inject.header is set", () => {
    const resolved = resolver.resolve(
      serviceKeyServer({
        key: "rk_live_custom",
        inject: { header: "X-Api-Key" },
      }),
    );

    assert.equal(resolved.headers["X-Api-Key"], "rk_live_custom");
    assert.equal(resolved.headers.Authorization, undefined);
    assert.equal(resolved.credentialRef, "service_key:stripe");
    assert.doesNotMatch(resolved.credentialRef ?? "", /rk_live_custom/);
  });

  it("rejects non-service_key strategies", () => {
    assert.throws(
      () =>
        resolver.resolve({
          name: "github",
          transport: { type: "http", url: "https://example.com/mcp" },
          credential: { strategy: "none" },
          policy: { default: "deny" },
        }),
      /cannot handle strategy "none"/,
    );
  });
});
