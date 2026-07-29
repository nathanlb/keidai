import type { DatabaseSync } from "node:sqlite";

export class SchemaIntegrityError extends Error {
  constructor(public readonly errors: string[]) {
    super(errors.join("\n"));
    this.name = "SchemaIntegrityError";
  }
}

/**
 * Fail-fast structural checks after migrations. Catches corrupted or
 * hand-edited databases that may bypass write-time FK / UNIQUE constraints
 * (e.g. imported with foreign_keys off).
 */
export function validateFudaSchemaIntegrity(db: DatabaseSync): void {
  const errors: string[] = [];

  const duplicateSlugs = db
    .prepare(
      `
      SELECT slug, COUNT(*) AS count
      FROM agents
      GROUP BY slug
      HAVING count > 1
      ORDER BY slug ASC
    `,
    )
    .all() as Array<{ slug: string; count: number }>;

  for (const row of duplicateSlugs) {
    errors.push(
      `Duplicate agent slug ${JSON.stringify(row.slug)} (${row.count} rows)`,
    );
  }

  const orphanGrants = db
    .prepare(
      `
      SELECT g.bearer_id AS bearer_id, g.agent_id AS agent_id
      FROM bearer_agent_grants g
      LEFT JOIN agents a ON a.id = g.agent_id
      WHERE a.id IS NULL
      ORDER BY g.bearer_id ASC, g.agent_id ASC
    `,
    )
    .all() as Array<{ bearer_id: string; agent_id: string }>;

  for (const row of orphanGrants) {
    errors.push(
      `Grant references missing agent ${JSON.stringify(row.agent_id)} (bearer ${JSON.stringify(row.bearer_id)})`,
    );
  }

  const orphanBearerGrants = db
    .prepare(
      `
      SELECT g.bearer_id AS bearer_id, g.agent_id AS agent_id
      FROM bearer_agent_grants g
      LEFT JOIN bearers b ON b.bearer_id = g.bearer_id
      WHERE b.bearer_id IS NULL
      ORDER BY g.bearer_id ASC, g.agent_id ASC
    `,
    )
    .all() as Array<{ bearer_id: string; agent_id: string }>;

  for (const row of orphanBearerGrants) {
    errors.push(
      `Grant references missing bearer ${JSON.stringify(row.bearer_id)} (agent ${JSON.stringify(row.agent_id)})`,
    );
  }

  const missingPersonas = db
    .prepare(
      `
      SELECT a.id AS id, a.current_persona_version AS version
      FROM agents a
      LEFT JOIN persona_versions pv
        ON pv.agent_id = a.id AND pv.version = a.current_persona_version
      WHERE pv.version IS NULL
      ORDER BY a.id ASC
    `,
    )
    .all() as Array<{ id: string; version: number }>;

  for (const row of missingPersonas) {
    errors.push(
      `Agent ${JSON.stringify(row.id)} current_persona_version ${row.version} has no persona_versions row`,
    );
  }

  if (errors.length > 0) {
    throw new SchemaIntegrityError(errors);
  }
}
