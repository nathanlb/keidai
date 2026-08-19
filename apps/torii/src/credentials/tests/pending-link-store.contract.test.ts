import "reflect-metadata";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PgPendingLinkStore } from "../pg-pending-link-store.service.js";
import type { PendingOAuthLinkStore } from "../types/pending-oauth-link-store.js";
import {
  createTestGatewayPersistence,
  type TestGatewayBackend,
} from "../../testing/gateway-persistence.js";

const backends: TestGatewayBackend[] = ["postgres", "memory"];

function runPendingLinkStoreContract(
  label: string,
  createStore: () => Promise<{
    store: PendingOAuthLinkStore;
    close: () => Promise<void>;
  }>,
): void {
  describe(label, () => {
    it("returns the latest link for an owner and provider", async () => {
      const { store, close } = await createStore();
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
        await close();
      }
    });

    it("deletes every link for an owner", async () => {
      const { store, close } = await createStore();
      try {
        await store.create({
          linkId: "link-a-1",
          ownerId: "owner-a",
          provider: "github",
          redirectUri: "http://localhost/callback/github",
          status: "pending",
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
        });
        await store.create({
          linkId: "link-a-2",
          ownerId: "owner-a",
          provider: "google",
          redirectUri: "http://localhost/callback/google",
          status: "completed",
          createdAt: new Date("2026-01-02T00:00:00.000Z"),
        });
        await store.create({
          linkId: "link-b",
          ownerId: "owner-b",
          provider: "github",
          redirectUri: "http://localhost/callback/github",
          status: "pending",
          createdAt: new Date("2026-01-03T00:00:00.000Z"),
        });

        assert.equal(await store.deleteByOwner("owner-a"), 2);
        assert.equal(await store.get("link-a-1"), null);
        assert.equal(await store.get("link-a-2"), null);
        assert.equal((await store.get("link-b"))?.linkId, "link-b");
        assert.deepEqual(await store.listOwnerIds(), ["owner-b"]);
        assert.equal(await store.getLatest("owner-a", "github"), null);
      } finally {
        await close();
      }
    });

    it("persists updates to an existing link", async () => {
      const { store, close } = await createStore();
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
        await close();
      }
    });
  });
}

describe("PendingOAuthLinkStore contract", () => {
  for (const backend of backends) {
    runPendingLinkStoreContract(`backend=${backend}`, async () => {
      const persistence = await createTestGatewayPersistence(backend);
      return {
        store: persistence.pendingLinkStore,
        close: persistence.close,
      };
    });
  }

  it("postgres persists updates across store instances", async () => {
    const persistence = await createTestGatewayPersistence("postgres");
    assert.ok(persistence.pool);

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

    try {
      await persistence.pendingLinkStore.create(link);
      await persistence.pendingLinkStore.update({
        ...link,
        status: "failed",
        error: "denied",
      });

      const reopened = new PgPendingLinkStore(persistence.pool);
      const updated = await reopened.get("link-1");
      assert.equal(updated?.status, "failed");
      assert.equal(updated?.error, "denied");
      assert.equal(updated?.codeVerifier, "verifier");
      assert.equal(updated?.uiOrigin, "http://localhost:3100");
    } finally {
      await persistence.close();
    }
  });
});
