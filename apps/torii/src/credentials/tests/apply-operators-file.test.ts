import "reflect-metadata";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { ConfigValidationError } from "../../config/utils/loader.js";
import { createTestGatewayPersistence } from "../../testing/gateway-persistence.js";
import { applyOperatorsFile } from "../apply-operators-file.js";

describe("applyOperatorsFile", () => {
  it("returns null when TORII_OPERATORS_PATH is unset", async () => {
    const persistence = createTestGatewayPersistence("memory");
    try {
      await persistence.tokenRepository.set("stale", "github", {
        accessToken: "stale-token",
      });

      const result = await applyOperatorsFile(
        persistence.tokenRepository,
        persistence.pendingLinkStore,
        undefined,
      );

      assert.equal(result, null);
      assert.equal(
        (await persistence.tokenRepository.get("stale", "github"))?.accessToken,
        "stale-token",
      );
    } finally {
      persistence.close();
    }
  });

  it("wipes grants for owners absent from the operators file", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "torii-ops-"));
    const operatorsPath = path.join(dir, "operators.yaml");
    await writeFile(
      operatorsPath,
      `operators:\n  - owner_id: demo-owner\n    google_email: ops@example.com\n`,
      "utf8",
    );

    const persistence = createTestGatewayPersistence("sqlite");
    try {
      await persistence.tokenRepository.set("stale", "github", {
        accessToken: "stale-token",
      });
      await persistence.tokenRepository.set("demo-owner", "github", {
        accessToken: "keep-token",
      });
      await persistence.pendingLinkStore.create({
        linkId: "link-stale",
        ownerId: "stale",
        provider: "github",
        redirectUri: "http://localhost/callback/github",
        status: "pending",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
      });

      const result = await applyOperatorsFile(
        persistence.tokenRepository,
        persistence.pendingLinkStore,
        operatorsPath,
      );

      assert.ok(result);
      assert.equal(result.ownersWiped, 1);
      assert.deepEqual(result.wipedOwnerIds, ["stale"]);
      assert.equal(
        await persistence.tokenRepository.get("stale", "github"),
        null,
      );
      assert.equal(
        (await persistence.tokenRepository.get("demo-owner", "github"))
          ?.accessToken,
        "keep-token",
      );
      assert.equal(await persistence.pendingLinkStore.get("link-stale"), null);
    } finally {
      persistence.close();
    }
  });

  it("fails closed when the operators file is invalid", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "torii-ops-"));
    const operatorsPath = path.join(dir, "operators.yaml");
    await writeFile(operatorsPath, "operators: []\n", "utf8");

    const persistence = createTestGatewayPersistence("memory");
    try {
      await persistence.tokenRepository.set("stale", "github", {
        accessToken: "stale-token",
      });

      await assert.rejects(
        () =>
          applyOperatorsFile(
            persistence.tokenRepository,
            persistence.pendingLinkStore,
            operatorsPath,
          ),
        ConfigValidationError,
      );
      assert.equal(
        (await persistence.tokenRepository.get("stale", "github"))?.accessToken,
        "stale-token",
      );
    } finally {
      persistence.close();
    }
  });
});
