import { toIso, type Pool } from "@keidai/postgres";
import type { OperatorRole } from "@keidai/shared";
import type {
  OwnerIdentityInput,
  OwnerRecord,
  OwnerRepository,
  OwnerStatus,
} from "./types/owner-repository.js";

interface OwnerRow {
  owner_id: string;
  created_at: Date | string;
  updated_at: Date | string;
  status: OwnerStatus;
  role: OperatorRole;
  idp_issuer: string | null;
  idp_sub: string | null;
  email: string | null;
  display_name: string | null;
  picture_url: string | null;
}

const OWNER_COLUMNS = `
  owner_id, created_at, updated_at, status, role,
  idp_issuer, idp_sub, email, display_name, picture_url
`;

function rowToOwner(row: OwnerRow): OwnerRecord {
  return {
    ownerId: row.owner_id,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    status: row.status,
    role: row.role,
    idpIssuer: row.idp_issuer,
    idpSub: row.idp_sub,
    email: row.email,
    displayName: row.display_name,
    pictureUrl: row.picture_url,
  };
}

export class PgOwnerRepository implements OwnerRepository {
  constructor(private readonly pool: Pool) {}

  async upsert(
    ownerId: string,
    options?: { role?: OperatorRole },
  ): Promise<OwnerRecord> {
    const now = new Date().toISOString();
    const role = options?.role ?? "member";
    await this.pool.query(
      `
        INSERT INTO owners (owner_id, created_at, updated_at, status, role)
        VALUES ($1, $2, $2, 'active', $3)
        ON CONFLICT (owner_id) DO NOTHING
      `,
      [ownerId, now, role],
    );
    if (options?.role) {
      await this.pool.query(
        `
          UPDATE owners
          SET role = $2, updated_at = $3
          WHERE owner_id = $1 AND role IS DISTINCT FROM $2
        `,
        [ownerId, options.role, now],
      );
    }
    const created = await this.get(ownerId);
    if (!created) {
      throw new Error(`failed to upsert owner "${ownerId}"`);
    }
    return created;
  }

  async setEmailIfAbsent(ownerId: string, email: string): Promise<void> {
    await this.pool.query(
      `
        UPDATE owners
        SET email = $2, updated_at = $3
        WHERE owner_id = $1 AND email IS NULL
      `,
      [ownerId, email, new Date().toISOString()],
    );
  }

  async get(ownerId: string): Promise<OwnerRecord | null> {
    const result = await this.pool.query<OwnerRow>(
      `SELECT ${OWNER_COLUMNS} FROM owners WHERE owner_id = $1`,
      [ownerId],
    );
    const row = result.rows[0];
    return row ? rowToOwner(row) : null;
  }

  async getByIdp(
    idpIssuer: string,
    idpSub: string,
  ): Promise<OwnerRecord | null> {
    const result = await this.pool.query<OwnerRow>(
      `
        SELECT ${OWNER_COLUMNS}
        FROM owners
        WHERE idp_issuer = $1 AND idp_sub = $2
      `,
      [idpIssuer, idpSub],
    );
    const row = result.rows[0];
    return row ? rowToOwner(row) : null;
  }

  async getUnboundByEmail(email: string): Promise<OwnerRecord | null> {
    const result = await this.pool.query<OwnerRow>(
      `
        SELECT ${OWNER_COLUMNS}
        FROM owners
        WHERE lower(email) = lower($1) AND idp_sub IS NULL
        ORDER BY created_at ASC
        LIMIT 1
      `,
      [email],
    );
    const row = result.rows[0];
    return row ? rowToOwner(row) : null;
  }

  async list(): Promise<OwnerRecord[]> {
    const result = await this.pool.query<OwnerRow>(
      `SELECT ${OWNER_COLUMNS} FROM owners ORDER BY owner_id ASC`,
    );
    return result.rows.map(rowToOwner);
  }

  async countActiveAdmins(): Promise<number> {
    const result = await this.pool.query<{ count: string | number }>(
      `
        SELECT COUNT(*)::int AS count
        FROM owners
        WHERE status = 'active' AND role = 'admin'
      `,
    );
    return Number(result.rows[0]?.count ?? 0);
  }

  async insertProvisioned(
    ownerId: string,
    identity: OwnerIdentityInput,
    role: OperatorRole,
  ): Promise<OwnerRecord> {
    const now = new Date().toISOString();
    const result = await this.pool.query<OwnerRow>(
      `
        INSERT INTO owners (
          owner_id, created_at, updated_at, status, role,
          idp_issuer, idp_sub, email, display_name, picture_url
        )
        VALUES ($1, $2, $2, 'active', $3, $4, $5, $6, $7, $8)
        RETURNING ${OWNER_COLUMNS}
      `,
      [
        ownerId,
        now,
        role,
        identity.idpIssuer,
        identity.idpSub,
        identity.email,
        identity.displayName ?? null,
        identity.pictureUrl ?? null,
      ],
    );
    const row = result.rows[0];
    if (!row) {
      throw new Error(`failed to insert owner "${ownerId}"`);
    }
    return rowToOwner(row);
  }

  async updateIdentity(
    ownerId: string,
    identity: OwnerIdentityInput,
  ): Promise<OwnerRecord | null> {
    const result = await this.pool.query<OwnerRow>(
      `
        UPDATE owners
        SET
          idp_issuer = $2,
          idp_sub = $3,
          email = $4,
          display_name = COALESCE($5, display_name),
          picture_url = COALESCE($6, picture_url),
          updated_at = $7
        WHERE owner_id = $1
        RETURNING ${OWNER_COLUMNS}
      `,
      [
        ownerId,
        identity.idpIssuer,
        identity.idpSub,
        identity.email,
        identity.displayName ?? null,
        identity.pictureUrl ?? null,
        new Date().toISOString(),
      ],
    );
    const row = result.rows[0];
    return row ? rowToOwner(row) : null;
  }

  async setStatus(
    ownerId: string,
    status: OwnerStatus,
  ): Promise<OwnerRecord | null> {
    return this.update(ownerId, { status });
  }

  async update(
    ownerId: string,
    patch: { status?: OwnerStatus; role?: OperatorRole },
  ): Promise<OwnerRecord | null> {
    const existing = await this.get(ownerId);
    if (!existing) {
      return null;
    }
    const result = await this.pool.query<OwnerRow>(
      `
        UPDATE owners
        SET status = $2, role = $3, updated_at = $4
        WHERE owner_id = $1
        RETURNING ${OWNER_COLUMNS}
      `,
      [
        ownerId,
        patch.status ?? existing.status,
        patch.role ?? existing.role,
        new Date().toISOString(),
      ],
    );
    const row = result.rows[0];
    return row ? rowToOwner(row) : null;
  }

  async delete(ownerId: string): Promise<boolean> {
    const result = await this.pool.query(
      `DELETE FROM owners WHERE owner_id = $1`,
      [ownerId],
    );
    return (result.rowCount ?? 0) > 0;
  }
}
