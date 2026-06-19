import "reflect-metadata";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ToriiConfig } from "@torii/shared";
import { ToriiConfigService } from "../../../config/torii-config.service.js";
import { CredentialResolverService } from "../../credential-resolver.service.js";
import { InMemoryTokenRepository } from "../../in-memory-token-repository.service.js";
import { NoneCredentialResolver } from "../none-credential-resolver.service.js";
import { DelegatedConnectionCredentialResolver } from "../delegated-connection-credential-resolver.service.js";
import { ServiceKeyCredentialResolver } from "../service-key-credential-resolver.service.js";

function noneServer(
  name = "deepwiki",
): ToriiConfig["servers"][number] {
  return {
    name,
    transport: { type: "http", url: "https://mcp.deepwiki.com/mcp" },
    credential: { strategy: "none" },
    policy: { default: "deny", allow: ["read_wiki_structure"] },
  };
}

describe("NoneCredentialResolver", () => {
  const resolver = new NoneCredentialResolver();

  it("returns empty headers and a trace-safe principal", () => {
    const resolved = resolver.resolve(noneServer());

    assert.deepEqual(resolved.headers, {});
    assert.equal(resolved.credentialRef, "none");
  });

  it("rejects non-none strategies", () => {
    assert.throws(
      () =>
        resolver.resolve({
          name: "stripe",
          transport: { type: "http", url: "https://mcp.stripe.com" },
          credential: {
            strategy: "service_key",
            key: "sk_test",
          },
          policy: { default: "deny" },
        }),
      /cannot handle strategy "service_key"/,
    );
  });
});

describe("CredentialResolverService none dispatch", () => {
  const configService = new ToriiConfigService({
    oauth_providers: {},
    servers: [],
  });
  const credentialResolver = new CredentialResolverService(
    new NoneCredentialResolver(),
    new DelegatedConnectionCredentialResolver(
      new InMemoryTokenRepository(),
      configService,
    ),
    new ServiceKeyCredentialResolver(),
  );

  it("dispatches none strategy without credential material", async () => {
    const resolved = await credentialResolver.resolve(noneServer());

    assert.deepEqual(resolved.headers, {});
    assert.equal(resolved.credentialRef, "none");
  });
});
