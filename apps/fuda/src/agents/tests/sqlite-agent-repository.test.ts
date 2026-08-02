import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { describe, it } from "node:test";
import { openFudaDatabase } from "../../storage/fuda-sqlite.js";
import { SqliteAgentRepository } from "../sqlite-agent-repository.js";

function createRepository(): {
  repository: SqliteAgentRepository;
  db: DatabaseSync;
} {
  const dbPath = path.join(
    mkdtempSync(path.join(tmpdir(), "fuda-agent-repo-")),
    "fuda.db",
  );
  const { db } = openFudaDatabase(dbPath);
  return { repository: new SqliteAgentRepository(db), db };
}

const sample = {
  slug: "newsletter",
  name: "Newsletter agent",
  ownerId: "owner-1",
  groups: ["editors"],
  persona: "You draft the weekly newsletter.",
};

describe("SqliteAgentRepository", () => {
  it("creates an agent with persona version 1", () => {
    const { repository } = createRepository();
    const created = repository.create(sample);

    assert.equal(created.slug, sample.slug);
    assert.equal(created.currentPersonaVersion, 1);
    assert.deepEqual(created.groups, ["editors"]);

    const persona = repository.getCurrentPersona(created.id);
    assert.equal(persona?.version, 1);
    assert.equal(persona?.content, sample.persona);
  });

  it("appends a new persona version without mutating prior content", () => {
    const { repository, db } = createRepository();
    const created = repository.create(sample);

    const v2 = repository.appendPersona(
      created.id,
      "You draft the weekly newsletter. Keep it under 500 words.",
    );
    assert.equal(v2?.version, 2);

    const v1 = repository.getPersonaVersion(created.id, 1);
    assert.equal(v1?.content, sample.persona);

    const current = repository.getCurrentPersona(created.id);
    assert.equal(current?.version, 2);
    assert.equal(
      current?.content,
      "You draft the weekly newsletter. Keep it under 500 words.",
    );

    // No update path may rewrite historical persona rows.
    const rows = (
      db
        .prepare(
          `SELECT version, content FROM persona_versions WHERE agent_id = ? ORDER BY version`,
        )
        .all(created.id) as Array<{ version: number; content: string }>
    ).map((row) => ({ version: row.version, content: row.content }));
    assert.deepEqual(rows, [
      { version: 1, content: sample.persona },
      {
        version: 2,
        content: "You draft the weekly newsletter. Keep it under 500 words.",
      },
    ]);
  });

  it("rejects duplicate slugs via the database unique constraint", () => {
    const { repository } = createRepository();
    repository.create(sample);
    assert.throws(
      () =>
        repository.create({
          ...sample,
          id: "other-id",
          name: "Other",
        }),
      /UNIQUE|constraint/i,
    );
  });

  it("updates name without touching slug or persona", () => {
    const { repository } = createRepository();
    const created = repository.create(sample);
    const updated = repository.updateName(created.id, {
      name: "Weekly newsletter",
    });

    assert.equal(updated?.name, "Weekly newsletter");
    assert.equal(updated?.slug, sample.slug);
    assert.equal(updated?.currentPersonaVersion, 1);
    assert.equal(
      repository.getPersonaVersion(created.id, 1)?.content,
      sample.persona,
    );
  });

  it("updates groups without touching slug or persona", () => {
    const { repository } = createRepository();
    const created = repository.create(sample);
    const updated = repository.updateGroups(created.id, {
      groups: ["editors", "ops"],
    });

    assert.deepEqual(updated?.groups, ["editors", "ops"]);
    assert.equal(updated?.slug, sample.slug);
    assert.equal(updated?.currentPersonaVersion, 1);
  });

  it("deletes an agent along with personas and grants", () => {
    const { repository, db } = createRepository();
    const created = repository.create(sample);
    db.prepare(
      `INSERT INTO bearers (bearer_id, display_name) VALUES (?, ?)`,
    ).run("ci", "CI");
    db.prepare(
      `INSERT INTO bearer_agent_grants (bearer_id, agent_id) VALUES (?, ?)`,
    ).run("ci", created.id);

    assert.equal(repository.delete(created.id), true);
    assert.equal(repository.get(created.id), null);
    assert.equal(repository.getPersonaVersion(created.id, 1), null);

    const grants = db
      .prepare(`SELECT COUNT(*) AS n FROM bearer_agent_grants WHERE agent_id = ?`)
      .get(created.id) as { n: number };
    assert.equal(grants.n, 0);
  });

  it("lists persona versions newest first", () => {
    const { repository } = createRepository();
    const created = repository.create(sample);
    repository.appendPersona(created.id, "Version two.");

    const personas = repository.listPersonas(created.id);
    assert.equal(personas.length, 2);
    assert.equal(personas[0]?.version, 2);
    assert.equal(personas[1]?.version, 1);
  });
});
