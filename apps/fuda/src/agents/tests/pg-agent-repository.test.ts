import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createIsolatedSchema,
  resolveTestDatabaseUrl,
} from "@keidai/postgres";
import { openFudaDatabase } from "../../storage/fuda-postgres.js";
import { PgAgentRepository } from "../pg-agent-repository.js";

const sample = {
  slug: "newsletter",
  name: "Newsletter agent",
  ownerId: "owner-1",
  groups: ["editors"],
  persona: "You draft the weekly newsletter.",
};

async function createRepository() {
  const isolated = await createIsolatedSchema();
  await openFudaDatabase(resolveTestDatabaseUrl(), isolated.pool);
  return {
    repository: new PgAgentRepository(isolated.pool),
    pool: isolated.pool,
    close: isolated.close,
  };
}

describe("PgAgentRepository", () => {
  it("creates an agent with persona version 1", async () => {
    const { repository, close } = await createRepository();
    try {
      const created = await repository.create(sample);
      assert.equal(created.slug, sample.slug);
      assert.equal(created.currentPersonaVersion, 1);
      assert.deepEqual(created.groups, ["editors"]);
      const persona = await repository.getCurrentPersona(created.id);
      assert.equal(persona?.version, 1);
      assert.equal(persona?.content, sample.persona);
    } finally {
      await close();
    }
  });

  it("appends a new persona version without mutating prior content", async () => {
    const { repository, pool, close } = await createRepository();
    try {
      const created = await repository.create(sample);
      const v2 = await repository.appendPersona(
        created.id,
        "You draft the weekly newsletter. Keep it under 500 words.",
      );
      assert.equal(v2?.version, 2);
      const v1 = await repository.getPersonaVersion(created.id, 1);
      assert.equal(v1?.content, sample.persona);
      const current = await repository.getCurrentPersona(created.id);
      assert.equal(current?.version, 2);

      const rows = await pool.query<{ version: number; content: string }>(
        `SELECT version, content FROM persona_versions WHERE agent_id = $1 ORDER BY version`,
        [created.id],
      );
      assert.deepEqual(
        rows.rows.map((row) => ({ version: row.version, content: row.content })),
        [
          { version: 1, content: sample.persona },
          {
            version: 2,
            content: "You draft the weekly newsletter. Keep it under 500 words.",
          },
        ],
      );
    } finally {
      await close();
    }
  });

  it("rejects duplicate slugs via the database unique constraint", async () => {
    const { repository, close } = await createRepository();
    try {
      await repository.create(sample);
      await assert.rejects(
        () =>
          repository.create({
            ...sample,
            id: "other-id",
            name: "Other",
          }),
        /unique|duplicate/i,
      );
    } finally {
      await close();
    }
  });

  it("updates name without touching slug or persona", async () => {
    const { repository, close } = await createRepository();
    try {
      const created = await repository.create(sample);
      const updated = await repository.updateName(created.id, {
        name: "Weekly newsletter",
      });
      assert.equal(updated?.name, "Weekly newsletter");
      assert.equal(updated?.slug, sample.slug);
      assert.equal(updated?.currentPersonaVersion, 1);
      assert.equal(
        (await repository.getPersonaVersion(created.id, 1))?.content,
        sample.persona,
      );
    } finally {
      await close();
    }
  });

  it("updates groups without touching slug or persona", async () => {
    const { repository, close } = await createRepository();
    try {
      const created = await repository.create(sample);
      const updated = await repository.updateGroups(created.id, {
        groups: ["editors", "ops"],
      });
      assert.deepEqual(updated?.groups, ["editors", "ops"]);
      assert.equal(updated?.slug, sample.slug);
      assert.equal(updated?.currentPersonaVersion, 1);
    } finally {
      await close();
    }
  });

  it("deletes an agent along with personas and grants", async () => {
    const { repository, pool, close } = await createRepository();
    try {
      const created = await repository.create(sample);
      await pool.query(
        `INSERT INTO bearers (bearer_id, display_name) VALUES ($1, $2)`,
        ["ci", "CI"],
      );
      await pool.query(
        `INSERT INTO bearer_agent_grants (bearer_id, agent_id) VALUES ($1, $2)`,
        ["ci", created.id],
      );
      assert.equal(await repository.delete(created.id), true);
      assert.equal(await repository.get(created.id), null);
      assert.equal(await repository.getPersonaVersion(created.id, 1), null);
      const grants = await pool.query<{ n: string }>(
        `SELECT COUNT(*)::text AS n FROM bearer_agent_grants WHERE agent_id = $1`,
        [created.id],
      );
      assert.equal(grants.rows[0]?.n, "0");
    } finally {
      await close();
    }
  });

  it("lists persona versions newest first", async () => {
    const { repository, close } = await createRepository();
    try {
      const created = await repository.create(sample);
      await repository.appendPersona(created.id, "Version two.");
      const personas = await repository.listPersonas(created.id);
      assert.equal(personas.length, 2);
      assert.equal(personas[0]?.version, 2);
      assert.equal(personas[1]?.version, 1);
    } finally {
      await close();
    }
  });
});
