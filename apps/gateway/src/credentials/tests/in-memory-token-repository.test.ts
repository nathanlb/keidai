import "reflect-metadata";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { InMemoryTokenRepository } from "../in-memory-token-repository.service.js";

describe("InMemoryTokenRepository", () => {
  it("deletes a stored grant", async () => {
    const repository = new InMemoryTokenRepository();
    await repository.set("owner", "github", { accessToken: "token" });

    assert.equal(await repository.delete("owner", "github"), true);
    assert.equal(await repository.get("owner", "github"), null);
    assert.equal(await repository.delete("owner", "github"), false);
  });

  it("lists grants for an owner without leaking other owners", async () => {
    const repository = new InMemoryTokenRepository();
    await repository.set("owner-a", "github", { accessToken: "gh-token" });
    await repository.set("owner-a", "linear", { accessToken: "linear-token" });
    await repository.set("owner-b", "github", { accessToken: "other-token" });

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
  });
});
