import "reflect-metadata";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { openGatewayDatabase } from "../../storage/gateway-sqlite.js";
import { SqlitePendingLinkStore } from "../sqlite-pending-link-store.service.js";
import type { PendingOAuthLinkStore } from "../types/pending-oauth-link-store.js";
import {
  createTestGatewayPersistence,
  type TestGatewayBackend,
} from "../../testing/gateway-persistence.js";

const backends: TestGatewayBackend[] = ["sqlite", "memory"];

function runPendingLinkStoreContract(
  label: string,
  createStore: () => {
    store: PendingOAuthLinkStore;
    close: () => void;
  },
): void {
  describe(label, () => {
    it("returns the latest link for an owner and provider", async () => {
      const { store, close } = createStore();
      try {
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
      } finally {
        close();
      }
    });

    it("persists updates to an existing link", async () => {
      const { store, close } = createStore();
      try {
        const link = {
          linkId: "link-1",
          ownerId: "owner",
          provider: "github",
          redirectUri: "http://localhost/callback/github",
          status: "pending" as const,
          createdAt: new Date(),
        };

        await store.create(link);
        await store.update({ ...link, status: "failed", error: "denied" });

        const updated = await store.get("link-1");
        assert.equal(updated?.status, "failed");
        assert.equal(updated?.error, "denied");
      } finally {
        close();
      }
    });
  });
}

describe("PendingOAuthLinkStore contract", () => {
  for (const backend of backends) {
    runPendingLinkStoreContract(`backend=${backend}`, () => {
      const persistence = createTestGatewayPersistence(backend);
      return {
        store: persistence.pendingLinkStore,
        close: persistence.close,
      };
    });
  }

  it("sqlite persists updates across store instances", async () => {
    const persistence = createTestGatewayPersistence("sqlite");
    assert.ok(persistence.databasePath);

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

    await persistence.pendingLinkStore.create(link);
    await persistence.pendingLinkStore.update({
      ...link,
      status: "failed",
      error: "denied",
    });
    persistence.close();

    const reopened = new SqlitePendingLinkStore(
      openGatewayDatabase(persistence.databasePath),
    );
    const updated = await reopened.get("link-1");
    assert.equal(updated?.status, "failed");
    assert.equal(updated?.error, "denied");
    assert.equal(updated?.codeVerifier, "verifier");
    assert.equal(updated?.uiOrigin, "http://localhost:3100");
  });
});
