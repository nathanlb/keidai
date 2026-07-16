import "reflect-metadata";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { SqlitePendingLinkStore } from "../sqlite-pending-link-store.service.js";
import { openGatewayDatabase } from "../../storage/gateway-sqlite.js";

function createStore(databasePath: string): SqlitePendingLinkStore {
  return new SqlitePendingLinkStore(openGatewayDatabase(databasePath));
}

describe("SqlitePendingLinkStore", () => {
  it("returns the latest link for an owner and provider", async () => {
    const databasePath = path.join(
      mkdtempSync(path.join(tmpdir(), "torii-gateway-db-")),
      "pending-links.db",
    );
    const store = createStore(databasePath);

    await store.create({
      linkId: "link-1",
      ownerId: "owner",
      provider: "github",
      redirectUri: "http://localhost/callback/github",
      status: "pending",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    });
    await store.create({
      linkId: "link-2",
      ownerId: "owner",
      provider: "github",
      redirectUri: "http://localhost/callback/github",
      status: "pending",
      createdAt: new Date("2026-01-02T00:00:00.000Z"),
    });

    const latest = await store.getLatest("owner", "github");
    assert.equal(latest?.linkId, "link-2");
  });

  it("persists updates and survives reopening the database", async () => {
    const databasePath = path.join(
      mkdtempSync(path.join(tmpdir(), "torii-gateway-db-")),
      "pending-links.db",
    );
    const store = createStore(databasePath);
    const link = {
      linkId: "link-1",
      ownerId: "owner",
      provider: "github",
      codeVerifier: "verifier",
      redirectUri: "http://localhost/callback/github",
      uiOrigin: "http://localhost:3100",
      status: "pending" as const,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    };

    await store.create(link);
    await store.update({ ...link, status: "failed", error: "denied" });

    const reopened = createStore(databasePath);
    const updated = await reopened.get("link-1");
    assert.equal(updated?.status, "failed");
    assert.equal(updated?.error, "denied");
    assert.equal(updated?.codeVerifier, "verifier");
    assert.equal(updated?.uiOrigin, "http://localhost:3100");
  });
});
