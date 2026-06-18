import "reflect-metadata";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ToriiConfig } from "@torii/shared";
import { InMemoryTokenRepository } from "../../in-memory-token-repository.service.js";
import { DelegatedConnectionCredentialResolver } from "../delegated-connection-credential-resolver.service.js";
import { CredentialResolutionError } from "../../types/credential-resolution.js";
import { STUB_OBO_SUBJECT } from "../../utils/obo-subject.js";

function userOAuthServer(
  name = "github",
): ToriiConfig["servers"][number] {
  return {
    name,
    transport: { type: "http", url: "https://example.com/mcp" },
    credential: {
      strategy: "user_oauth",
      provider: "github",
      subject: "${request.user}",
    },
    policy: { default: "deny" },
  };
}

describe("InMemoryTokenRepository", () => {
  it("stores and retrieves tokens by subject and provider", async () => {
    const repository = new InMemoryTokenRepository();

    await repository.set("user-1", "github", {
      accessToken: "gho_test",
      refreshToken: "ghr_test",
    });

    const token = await repository.get("user-1", "github");
    assert.equal(token?.accessToken, "gho_test");
    assert.equal(token?.refreshToken, "ghr_test");
    assert.equal(await repository.get("user-1", "stripe"), null);
  });
});

describe("DelegatedConnectionCredentialResolver", () => {
  it("injects a bearer token when one is stored", async () => {
    const repository = new InMemoryTokenRepository();
    await repository.set(STUB_OBO_SUBJECT, "github", {
      accessToken: "gho_secret_token",
    });
    const resolver = new DelegatedConnectionCredentialResolver(repository);

    const resolved = await resolver.resolve(userOAuthServer());

    assert.equal(
      resolved.headers.Authorization,
      "Bearer gho_secret_token",
    );
    assert.equal(resolved.credentialRef, "github:stub-user");
  });

  it("returns a clear error when no token is stored", async () => {
    const resolver = new DelegatedConnectionCredentialResolver(
      new InMemoryTokenRepository(),
    );

    await assert.rejects(
      () => resolver.resolve(userOAuthServer()),
      (error: unknown) => {
        assert.ok(error instanceof CredentialResolutionError);
        assert.match(
          error.message,
          /No valid OAuth token for provider "github"/,
        );
        assert.doesNotMatch(error.message, /gho_/);
        return true;
      },
    );
  });

  it("treats an expired token as missing", async () => {
    const repository = new InMemoryTokenRepository();
    await repository.set(STUB_OBO_SUBJECT, "github", {
      accessToken: "gho_expired",
      expiresAt: new Date(Date.now() - 60_000),
    });
    const resolver = new DelegatedConnectionCredentialResolver(repository);

    await assert.rejects(
      () => resolver.resolve(userOAuthServer()),
      (error: unknown) => error instanceof CredentialResolutionError,
    );
  });
});
