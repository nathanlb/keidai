import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createIsolatedSchema, resolveTestDatabaseUrl } from "@keidai/postgres";
import { openFudaDatabase } from "../../storage/fuda-postgres.js";
import { PgOwnerRepository } from "../pg-owner-repository.js";
import { resolveOrProvisionOwner } from "../resolve-or-provision-owner.js";

const issuer = "https://accounts.google.com";

describe("resolveOrProvisionOwner", () => {
  it("creates an owner from the email, then keeps that id when the email changes", async () => {
    const isolated = await createIsolatedSchema();
    try {
      await openFudaDatabase(resolveTestDatabaseUrl(), isolated.pool);
      const owners = new PgOwnerRepository(isolated.pool);

      const created = await resolveOrProvisionOwner(owners, {
        idpIssuer: issuer,
        idpSub: "sub-alice",
        email: "Alice.Smith@acme.com",
        displayName: "Alice",
      });
      assert.equal(created.ok, true);
      if (!created.ok) {
        return;
      }
      assert.equal(created.owner.ownerId, "alice-smith");
      assert.equal(created.owner.status, "active");

      const renamed = await resolveOrProvisionOwner(owners, {
        idpIssuer: issuer,
        idpSub: "sub-alice",
        email: "alice.jones@acme.com",
        displayName: "Alice Jones",
      });
      assert.equal(renamed.ok, true);
      if (!renamed.ok) {
        return;
      }
      assert.equal(renamed.owner.ownerId, "alice-smith");
      assert.equal(renamed.owner.email, "alice.jones@acme.com");
      assert.equal(renamed.owner.displayName, "Alice Jones");
    } finally {
      await isolated.close();
    }
  });

  it("binds a pre-seeded owner id and rejects a later login once disabled", async () => {
    const isolated = await createIsolatedSchema();
    try {
      await openFudaDatabase(resolveTestDatabaseUrl(), isolated.pool);
      const owners = new PgOwnerRepository(isolated.pool);
      await owners.upsert("nathan-lafranceb");
      await owners.setEmailIfAbsent(
        "nathan-lafranceb",
        "nathan.lafranceb@gmail.com",
      );

      const bound = await resolveOrProvisionOwner(owners, {
        idpIssuer: issuer,
        idpSub: "sub-nathan",
        email: "nathan.lafranceb@gmail.com",
        ownerId: "nathan-lafranceb",
      });
      assert.equal(bound.ok, true);
      if (!bound.ok) {
        return;
      }
      assert.equal(bound.owner.ownerId, "nathan-lafranceb");
      assert.equal(bound.owner.idpSub, "sub-nathan");

      await owners.setStatus("nathan-lafranceb", "disabled");
      const denied = await resolveOrProvisionOwner(owners, {
        idpIssuer: issuer,
        idpSub: "sub-nathan",
        email: "other@gmail.com",
        displayName: "Changed",
      });
      assert.equal(denied.ok, false);
      if (denied.ok) {
        return;
      }
      assert.equal(denied.reason, "disabled");
      assert.equal(denied.owner.email, "nathan.lafranceb@gmail.com");
      assert.equal(denied.owner.displayName, null);
    } finally {
      await isolated.close();
    }
  });

  it("suffixes the derived id when the slug is already taken", async () => {
    const isolated = await createIsolatedSchema();
    try {
      await openFudaDatabase(resolveTestDatabaseUrl(), isolated.pool);
      const owners = new PgOwnerRepository(isolated.pool);
      await owners.upsert("ada");

      const created = await resolveOrProvisionOwner(owners, {
        idpIssuer: issuer,
        idpSub: "sub-ada",
        email: "ada@acme.com",
      });
      assert.equal(created.ok, true);
      if (!created.ok) {
        return;
      }
      assert.equal(created.owner.ownerId, "ada-2");
    } finally {
      await isolated.close();
    }
  });

  it("handles concurrent first-time logins for the same or colliding subjects", async () => {
    const isolated = await createIsolatedSchema();
    try {
      await openFudaDatabase(resolveTestDatabaseUrl(), isolated.pool);
      const owners = new PgOwnerRepository(isolated.pool);

      const [sameA, sameB] = await Promise.all([
        resolveOrProvisionOwner(owners, {
          idpIssuer: issuer,
          idpSub: "sub-concurrent",
          email: "concurrent@acme.com",
        }),
        resolveOrProvisionOwner(owners, {
          idpIssuer: issuer,
          idpSub: "sub-concurrent",
          email: "concurrent@acme.com",
        }),
      ]);
      assert.equal(sameA.ok, true);
      assert.equal(sameB.ok, true);
      if (sameA.ok && sameB.ok) {
        assert.equal(sameA.owner.ownerId, "concurrent");
        assert.equal(sameB.owner.ownerId, "concurrent");
      }

      const [collidingA, collidingB] = await Promise.all([
        resolveOrProvisionOwner(owners, {
          idpIssuer: issuer,
          idpSub: "sub-grace-1",
          email: "grace@dept1.acme.com",
        }),
        resolveOrProvisionOwner(owners, {
          idpIssuer: issuer,
          idpSub: "sub-grace-2",
          email: "grace@dept2.acme.com",
        }),
      ]);
      assert.equal(collidingA.ok, true);
      assert.equal(collidingB.ok, true);
      if (collidingA.ok && collidingB.ok) {
        const ids = [collidingA.owner.ownerId, collidingB.owner.ownerId].sort();
        assert.deepEqual(ids, ["grace", "grace-2"]);
      }
    } finally {
      await isolated.close();
    }
  });
});
