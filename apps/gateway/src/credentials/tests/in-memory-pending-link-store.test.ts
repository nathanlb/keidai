import "reflect-metadata";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { InMemoryPendingLinkStore } from "../in-memory-pending-link-store.service.js";

describe("InMemoryPendingLinkStore", () => {
  it("returns the latest link for an owner and provider", async () => {
    const store = new InMemoryPendingLinkStore();

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

  it("persists updates to an existing link", async () => {
    const store = new InMemoryPendingLinkStore();
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
  });
});
