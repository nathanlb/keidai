import { randomUUID } from "node:crypto";
import { toIso, withTransaction, type Pool } from "@keidai/postgres";
import { parseJsonValue } from "../storage/pg-values.js";
import type { GroupPolicy, GroupServerPolicy } from "./types/group-policy.js";
import type { GroupPolicyRepository } from "./types/group-policy-repository.js";
import type {
  CreateGroupPolicyInput,
  UpdateGroupPolicyInput,
} from "./types/group-policy-write.js";

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

function rowToGroup(
  row: GroupRow,
  servers: GroupServerPolicy[],
): GroupPolicy {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    createdAt: toDate(row.created_at),
    updatedAt: toDate(row.updated_at),
    servers,
  };
}

async function insertServerPolicies(
  queryable: Pick<Pool, "query">,
  groupId: string,
  servers: readonly GroupServerPolicy[],
): Promise<void> {
  for (const policy of servers) {
    await queryable.query(
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
        groupId,
        policy.server,
        policy.default,
        JSON.stringify(policy.allow),
        JSON.stringify(policy.deny),
        JSON.stringify(policy.gated),
      ],
    );
  }
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

    const serversByGroup = await this.loadServersByGroupId(
      groups.rows.map((row) => row.id),
    );
    return groups.rows.map((row) =>
      rowToGroup(row, serversByGroup.get(row.id) ?? []),
    );
  }

  async get(id: string): Promise<GroupPolicy | null> {
    const result = await this.pool.query<GroupRow>(
      `
        SELECT id, name, description, created_at, updated_at
        FROM groups
        WHERE id = $1
      `,
      [id],
    );
    const row = result.rows[0];
    if (!row) {
      return null;
    }
    const serversByGroup = await this.loadServersByGroupId([row.id]);
    return rowToGroup(row, serversByGroup.get(row.id) ?? []);
  }

  async create(input: CreateGroupPolicyInput): Promise<GroupPolicy> {
    const now = new Date();
    const group: GroupPolicy = {
      id: randomUUID(),
      name: input.name,
      description: input.description,
      createdAt: now,
      updatedAt: now,
      servers: input.servers.map((policy) => ({
        ...policy,
        allow: [...policy.allow],
        deny: [...policy.deny],
        gated: [...policy.gated],
      })),
    };

    await withTransaction(this.pool, async (client) => {
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
      await insertServerPolicies(client, group.id, group.servers);
    });

    return group;
  }

  async update(
    id: string,
    input: UpdateGroupPolicyInput,
  ): Promise<GroupPolicy | null> {
    const existing = await this.get(id);
    if (!existing) {
      return null;
    }

    const now = new Date();
    const next: GroupPolicy = {
      ...existing,
      description: input.description ?? existing.description,
      updatedAt: now,
      servers:
        input.servers === undefined
          ? existing.servers
          : input.servers.map((policy) => ({
              ...policy,
              allow: [...policy.allow],
              deny: [...policy.deny],
              gated: [...policy.gated],
            })),
    };

    await withTransaction(this.pool, async (client) => {
      await client.query(
        `
          UPDATE groups
          SET description = $2, updated_at = $3
          WHERE id = $1
        `,
        [id, next.description, toIso(now)],
      );
      if (input.servers !== undefined) {
        await client.query(
          `DELETE FROM group_server_policies WHERE group_id = $1`,
          [id],
        );
        await insertServerPolicies(client, id, next.servers);
      }
    });

    return next;
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.pool.query(
      `DELETE FROM groups WHERE id = $1`,
      [id],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async referencesServer(server: string): Promise<boolean> {
    const result = await this.pool.query<{ present: boolean }>(
      `
        SELECT EXISTS (
          SELECT 1 FROM group_server_policies WHERE server = $1
        ) AS present
      `,
      [server],
    );
    return result.rows[0]?.present ?? false;
  }

  private async loadServersByGroupId(
    groupIds: readonly string[],
  ): Promise<Map<string, GroupServerPolicy[]>> {
    if (groupIds.length === 0) {
      return new Map();
    }

    const policies = await this.pool.query<ServerPolicyRow>(
      `
        SELECT group_id, server, default_effect, allow_tools, deny_tools, gated_tools
        FROM group_server_policies
        WHERE group_id = ANY($1::text[])
        ORDER BY server ASC
      `,
      [groupIds],
    );

    const serversByGroup = new Map<string, GroupServerPolicy[]>();
    for (const row of policies.rows) {
      const list = serversByGroup.get(row.group_id) ?? [];
      list.push(rowToServerPolicy(row));
      serversByGroup.set(row.group_id, list);
    }
    return serversByGroup;
  }
}
