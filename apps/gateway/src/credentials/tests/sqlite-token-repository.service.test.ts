import "reflect-metadata";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { SqliteTokenRepository } from "../sqlite-token-repository.service.js";
import { openTokenDatabase } from "../utils/sqlite-token-store.js";

function createRepository(databasePath: string): SqliteTokenRepository {
  return new SqliteTokenRepository(openTokenDatabase(databasePath));
}

describe("SqliteTokenRepository", () => {
  it("stores and retrieves tokens by owner and provider", async () => {
    const databasePath = path.join(
      mkdtempSync(path.join(tmpdir(), "torii-token-store-")),
      "tokens.db",
    );
    const repository = createRepository(databasePath);

    await repository.set("user-1", "github", {
      accessToken: "gho_test",
      refreshToken: "ghr_test",
    });

    const token = await repository.get("user-1", "github");
    assert.equal(token?.accessToken, "gho_test");
    assert.equal(token?.refreshToken, "ghr_test");
    assert.equal(await repository.get("user-1", "stripe"), null);
  });

  it("persists tokens across repository instances", async () => {
    const databasePath = path.join(
      mkdtempSync(path.join(tmpdir(), "torii-token-store-")),
      "tokens.db",
    );
    const firstRepository = createRepository(databasePath);

    await firstRepository.set("user-1", "github", {
      accessToken: "gho_persisted",
      refreshToken: "ghr_persisted",
      expiresAt: new Date("2030-01-01T00:00:00.000Z"),
    });

    const secondRepository = createRepository(databasePath);
    const token = await secondRepository.get("user-1", "github");

    assert.equal(token?.accessToken, "gho_persisted");
    assert.equal(token?.refreshToken, "ghr_persisted");
    assert.equal(token?.expiresAt?.toISOString(), "2030-01-01T00:00:00.000Z");
  });

  it("upserts tokens for the same owner and provider", async () => {
    const databasePath = path.join(
      mkdtempSync(path.join(tmpdir(), "torii-token-store-")),
      "tokens.db",
    );
    const repository = createRepository(databasePath);

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
  });
});
