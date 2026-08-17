import "reflect-metadata";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { openGatewayDatabase } from "../../storage/gateway-sqlite.js";
import { SqliteTokenRepository } from "../sqlite-token-repository.service.js";
import type { TokenRepository } from "../types/token-repository.js";
import {
  createTestGatewayPersistence,
  type TestGatewayBackend,
} from "../../testing/gateway-persistence.js";

const backends: TestGatewayBackend[] = ["sqlite", "memory"];

function runTokenRepositoryContract(
  label: string,
  createRepository: () => {
    repository: TokenRepository;
    close: () => void;
  },
): void {
  describe(label, () => {
    it("stores and retrieves tokens by owner and provider", async () => {
      const { repository, close } = createRepository();
      try {
        await repository.set("user-1", "github", {
          accessToken: "gho_test",
          refreshToken: "ghr_test",
        });

        const token = await repository.get("user-1", "github");
        assert.equal(token?.accessToken, "gho_test");
        assert.equal(token?.refreshToken, "ghr_test");
        assert.equal(await repository.get("user-1", "stripe"), null);
      } finally {
        close();
      }
    });

    it("upserts tokens for the same owner and provider", async () => {
      const { repository, close } = createRepository();
      try {
        await repository.set("user-1", "github", {
          accessToken: "gho_old",
          refreshToken: "ghr_old",
        });
        await repository.set("user-1", "github", {
          accessToken: "gho_new",
        });

        const token = await repository.get("user-1", "github");
        assert.equal(token?.accessToken, "gho_new");
        assert.equal(token?.refreshToken, undefined);
      } finally {
        close();
      }
    });

    it("deletes a stored grant", async () => {
      const { repository, close } = createRepository();
      try {
        await repository.set("owner", "github", { accessToken: "token" });

        assert.equal(await repository.delete("owner", "github"), true);
        assert.equal(await repository.get("owner", "github"), null);
        assert.equal(await repository.delete("owner", "github"), false);
      } finally {
        close();
      }
    });

    it("deletes every grant for an owner and lists remaining owner ids", async () => {
      const { repository, close } = createRepository();
      try {
        await repository.set("owner-a", "github", { accessToken: "gh-token" });
        await repository.set("owner-a", "linear", {
          accessToken: "linear-token",
        });
        await repository.set("owner-b", "github", {
          accessToken: "other-token",
        });

        assert.equal(await repository.deleteByOwner("owner-a"), 2);
        assert.equal(await repository.get("owner-a", "github"), null);
        assert.equal(await repository.get("owner-a", "linear"), null);
        assert.equal(
          (await repository.get("owner-b", "github"))?.accessToken,
          "other-token",
        );
        assert.deepEqual(await repository.listOwnerIds(), ["owner-b"]);
        assert.equal(await repository.deleteByOwner("owner-a"), 0);
      } finally {
        close();
      }
    });

    it("lists grants for an owner without leaking other owners", async () => {
      const { repository, close } = createRepository();
      try {
        await repository.set("owner-a", "github", { accessToken: "gh-token" });
        await repository.set("owner-a", "linear", {
          accessToken: "linear-token",
        });
        await repository.set("owner-b", "github", {
          accessToken: "other-token",
        });

        const grants = await repository.listByOwner("owner-a");
        assert.equal(grants.length, 2);
        assert.deepEqual(
          grants.map((grant) => grant.provider).sort(),
          ["github", "linear"],
        );
        assert.equal(
          grants.every((grant) => grant.token.accessToken !== "other-token"),
          true,
        );
      } finally {
        close();
      }
    });
  });
}

describe("TokenRepository contract", () => {
  for (const backend of backends) {
    runTokenRepositoryContract(`backend=${backend}`, () => {
      const persistence = createTestGatewayPersistence(backend);
      return {
        repository: persistence.tokenRepository,
        close: persistence.close,
      };
    });
  }

  it("sqlite persists tokens across repository instances", async () => {
    const persistence = createTestGatewayPersistence("sqlite");
    assert.ok(persistence.databasePath);

    await persistence.tokenRepository.set("user-1", "github", {
      accessToken: "gho_persisted",
      refreshToken: "ghr_persisted",
      expiresAt: new Date("2030-01-01T00:00:00.000Z"),
    });
    persistence.close();

    const reopened = new SqliteTokenRepository(
      openGatewayDatabase(persistence.databasePath),
    );
    const token = await reopened.get("user-1", "github");
    assert.equal(token?.accessToken, "gho_persisted");
    assert.equal(token?.refreshToken, "ghr_persisted");
    assert.equal(token?.expiresAt?.toISOString(), "2030-01-01T00:00:00.000Z");
  });
});
