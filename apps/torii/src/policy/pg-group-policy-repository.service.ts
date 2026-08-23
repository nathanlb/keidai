import { toIso, withTransaction, type Pool } from "@keidai/postgres";
import { parseJsonValue } from "../storage/pg-values.js";
import type { GroupPolicy, GroupServerPolicy } from "./types/group-policy.js";
import type { GroupPolicyRepository } from "./types/group-policy-repository.js";

interface GroupRow {
  id: string;
  name: string;
  description: string;
  created_at: Date | string;
  updated_at: Date | string;
}

interface ServerPolicyRow {
  group_id: string;
  server: string;
  default_effect: "allow" | "deny";
  allow_tools: string[] | string;
  deny_tools: string[] | string;
  gated_tools: string[] | string;
}

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function rowToServerPolicy(row: ServerPolicyRow): GroupServerPolicy {
  return {
    server: row.server,
    default: row.default_effect,
    allow: parseJsonValue<string[]>(row.allow_tools),
    deny: parseJsonValue<string[]>(row.deny_tools),
    gated: parseJsonValue<string[]>(row.gated_tools),
  };
}

export class PgGroupPolicyRepository implements GroupPolicyRepository {
  constructor(private readonly pool: Pool) {}

  async list(): Promise<GroupPolicy[]> {
    const groups = await this.pool.query<GroupRow>(
      `
        SELECT id, name, description, created_at, updated_at
        FROM groups
        ORDER BY name ASC
      `,
    );
    if (groups.rows.length === 0) {
      return [];
    }

    const policies = await this.pool.query<ServerPolicyRow>(
      `
        SELECT group_id, server, default_effect, allow_tools, deny_tools, gated_tools
        FROM group_server_policies
        ORDER BY server ASC
      `,
    );

    const serversByGroup = new Map<string, GroupServerPolicy[]>();
    for (const row of policies.rows) {
      const list = serversByGroup.get(row.group_id) ?? [];
      list.push(rowToServerPolicy(row));
      serversByGroup.set(row.group_id, list);
    }

    return groups.rows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      createdAt: toDate(row.created_at),
      updatedAt: toDate(row.updated_at),
      servers: serversByGroup.get(row.id) ?? [],
    }));
  }

  async isEmpty(): Promise<boolean> {
    const result = await this.pool.query<{ is_empty: boolean }>(
      `SELECT NOT EXISTS (SELECT 1 FROM groups LIMIT 1) AS is_empty`,
    );
    return result.rows[0]?.is_empty ?? true;
  }

  async insertAll(groups: readonly GroupPolicy[]): Promise<void> {
    if (groups.length === 0) {
      return;
    }

    await withTransaction(this.pool, async (client) => {
      for (const group of groups) {
        await client.query(
          `
            INSERT INTO groups (id, name, description, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5)
          `,
          [
            group.id,
            group.name,
            group.description,
            toIso(group.createdAt),
            toIso(group.updatedAt),
          ],
        );
        for (const policy of group.servers) {
          await client.query(
            `
              INSERT INTO group_server_policies (
                group_id,
                server,
                default_effect,
                allow_tools,
                deny_tools,
                gated_tools
              )
              VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6::jsonb)
            `,
            [
              group.id,
              policy.server,
              policy.default,
              JSON.stringify(policy.allow),
              JSON.stringify(policy.deny),
              JSON.stringify(policy.gated),
            ],
          );
        }
      }
    });
  }
}
