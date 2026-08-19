import "reflect-metadata";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createTestGatewayPersistence } from "../../testing/gateway-persistence.js";
import { reconcileOAuthGrants } from "../reconcile-oauth-grants.js";

describe("reconcileOAuthGrants", () => {
  it("wipes tokens and pending links for owners absent from the registry", async () => {
    const persistence = await createTestGatewayPersistence("postgres");
    try {
      await persistence.tokenRepository.set("keep", "github", {
        accessToken: "keep-token",
      });
      await persistence.tokenRepository.set("drop", "github", {
        accessToken: "drop-token",
      });
      await persistence.tokenRepository.set("drop", "google", {
        accessToken: "drop-google",
      });
      await persistence.pendingLinkStore.create({
        linkId: "link-keep",
        ownerId: "keep",
        provider: "github",
        redirectUri: "http://localhost/callback/github",
        status: "pending",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
      });
      await persistence.pendingLinkStore.create({
        linkId: "link-drop",
        ownerId: "drop",
        provider: "github",
        redirectUri: "http://localhost/callback/github",
        status: "completed",
        createdAt: new Date("2026-01-02T00:00:00.000Z"),
      });

      const result = await reconcileOAuthGrants(
        persistence.tokenRepository,
        persistence.pendingLinkStore,
        ["keep", "new"],
      );

      assert.equal(result.ownersWiped, 1);
      assert.deepEqual(result.wipedOwnerIds, ["drop"]);
      assert.equal(result.tokensDeleted, 2);
      assert.equal(result.pendingLinksDeleted, 1);
      assert.equal(
        (await persistence.tokenRepository.get("keep", "github"))?.accessToken,
        "keep-token",
      );
      assert.equal(
        await persistence.tokenRepository.get("drop", "github"),
        null,
      );
      assert.equal(
        await persistence.tokenRepository.get("drop", "google"),
        null,
      );
      assert.equal(
        (await persistence.pendingLinkStore.get("link-keep"))?.linkId,
        "link-keep",
      );
      assert.equal(await persistence.pendingLinkStore.get("link-drop"), null);
    } finally {
      await persistence.close();
    }
  });

  it("is a no-op when every stored owner is still in the registry", async () => {
    const persistence = await createTestGatewayPersistence("memory");
    try {
      await persistence.tokenRepository.set("keep", "github", {
        accessToken: "keep-token",
      });

      const result = await reconcileOAuthGrants(
        persistence.tokenRepository,
        persistence.pendingLinkStore,
        ["keep"],
      );

      assert.deepEqual(result, {
        tokensDeleted: 0,
        pendingLinksDeleted: 0,
        ownersWiped: 0,
        wipedOwnerIds: [],
      });
      assert.equal(
        (await persistence.tokenRepository.get("keep", "github"))?.accessToken,
        "keep-token",
      );
    } finally {
      await persistence.close();
    }
  });
});
