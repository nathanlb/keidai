import type { Queryable } from "@keidai/postgres";

export class SchemaIntegrityError extends Error {
  constructor(public readonly errors: string[]) {
    super(errors.join("\n"));
    this.name = "SchemaIntegrityError";
  }
}

/**
 * Fail-fast structural checks after migrations.
 */
export async function validateFudaSchemaIntegrity(
  queryable: Queryable,
): Promise<void> {
  const errors: string[] = [];

  const duplicateSlugs = await queryable.query<{ slug: string; count: string }>(
    `
      SELECT slug, COUNT(*) AS count
      FROM agents
      GROUP BY slug
      HAVING COUNT(*) > 1
      ORDER BY slug ASC
    `,
  );

  for (const row of duplicateSlugs.rows) {
    errors.push(
      `Duplicate agent slug ${JSON.stringify(row.slug)} (${row.count} rows)`,
    );
  }

  const orphanGrants = await queryable.query<{
    bearer_id: string;
    agent_id: string;
  }>(
    `
      SELECT g.bearer_id AS bearer_id, g.agent_id AS agent_id
      FROM bearer_agent_grants g
      LEFT JOIN agents a ON a.id = g.agent_id
      WHERE a.id IS NULL
      ORDER BY g.bearer_id ASC, g.agent_id ASC
    `,
  );

  for (const row of orphanGrants.rows) {
    errors.push(
      `Grant references missing agent ${JSON.stringify(row.agent_id)} (bearer ${JSON.stringify(row.bearer_id)})`,
    );
  }

  const orphanBearerGrants = await queryable.query<{
    bearer_id: string;
    agent_id: string;
  }>(
    `
      SELECT g.bearer_id AS bearer_id, g.agent_id AS agent_id
      FROM bearer_agent_grants g
      LEFT JOIN bearers b ON b.bearer_id = g.bearer_id
      WHERE b.bearer_id IS NULL
      ORDER BY g.bearer_id ASC, g.agent_id ASC
    `,
  );

  for (const row of orphanBearerGrants.rows) {
    errors.push(
      `Grant references missing bearer ${JSON.stringify(row.bearer_id)} (agent ${JSON.stringify(row.agent_id)})`,
    );
  }

  const missingPersonas = await queryable.query<{
    id: string;
    version: number;
  }>(
    `
      SELECT a.id AS id, a.current_persona_version AS version
      FROM agents a
      LEFT JOIN persona_versions pv
        ON pv.agent_id = a.id AND pv.version = a.current_persona_version
      WHERE pv.version IS NULL
      ORDER BY a.id ASC
    `,
  );

  for (const row of missingPersonas.rows) {
    errors.push(
      `Agent ${JSON.stringify(row.id)} current_persona_version ${row.version} has no persona_versions row`,
    );
  }

  if (errors.length > 0) {
    throw new SchemaIntegrityError(errors);
  }
}
