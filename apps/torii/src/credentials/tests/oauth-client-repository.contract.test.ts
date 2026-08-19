import "reflect-metadata";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type {
  OAuthClientRepository,
  OAuthProviderClient,
} from "../types/oauth-client-repository.js";
import {
  createTestGatewayPersistence,
  type TestGatewayBackend,
} from "../../testing/gateway-persistence.js";

const backends: TestGatewayBackend[] = ["postgres", "memory"];

function runOAuthClientRepositoryContract(
  label: string,
  createRepository: () => Promise<{
    repository: OAuthClientRepository;
    close: () => Promise<void>;
  }>,
): void {
  describe(label, () => {
    it("stores and retrieves provider clients", async () => {
      const { repository, close } = await createRepository();
      try {
        const client: OAuthProviderClient = {
          clientId: "client-1",
          clientSecret: "secret",
          redirectUri: "http://localhost/callback",
        };
        await repository.set("github", client);

        const loaded = await repository.get("github");
        assert.deepEqual(loaded, client);
        assert.equal(await repository.get("missing"), null);
      } finally {
        await close();
      }
    });

    it("upserts clients for the same provider", async () => {
      const { repository, close } = await createRepository();
      try {
        await repository.set("notion", {
          clientId: "old",
          redirectUri: "http://localhost/old",
        });
        await repository.set("notion", {
          clientId: "new",
          redirectUri: "http://localhost/new",
        });

        const loaded = await repository.get("notion");
        assert.equal(loaded?.clientId, "new");
        assert.equal(loaded?.redirectUri, "http://localhost/new");
        assert.equal(loaded?.clientSecret, undefined);
      } finally {
        await close();
      }
    });
  });
}

describe("OAuthClientRepository contract", () => {
  for (const backend of backends) {
    runOAuthClientRepositoryContract(`backend=${backend}`, async () => {
      const persistence = await createTestGatewayPersistence(backend);
      return {
        repository: persistence.clientRepository,
        close: persistence.close,
      };
    });
  }
});
