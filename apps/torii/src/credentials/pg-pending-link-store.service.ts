import { toIso, type Pool } from "@keidai/postgres";
import type { PendingOAuthLink } from "./types/pending-oauth-link.js";
import type { PendingOAuthLinkStore } from "./types/pending-oauth-link-store.js";

interface PendingLinkRow {
  link_id: string;
  owner_id: string;
  provider: string;
  code_verifier: string | null;
  redirect_uri: string;
  ui_origin: string | null;
  status: PendingOAuthLink["status"];
  error: string | null;
  created_at: Date | string;
}

function rowToPendingLink(row: PendingLinkRow): PendingOAuthLink {
  return {
    linkId: row.link_id,
    ownerId: row.owner_id,
    provider: row.provider,
    ...(row.code_verifier !== null ? { codeVerifier: row.code_verifier } : {}),
    redirectUri: row.redirect_uri,
    ...(row.ui_origin !== null ? { uiOrigin: row.ui_origin } : {}),
    status: row.status,
    ...(row.error !== null ? { error: row.error } : {}),
    createdAt: new Date(row.created_at),
  };
}

export class PgPendingLinkStore implements PendingOAuthLinkStore {
  constructor(private readonly pool: Pool) {}

  async create(link: PendingOAuthLink): Promise<void> {
    await this.pool.query(
      `
        INSERT INTO pending_oauth_links (
          link_id,
          owner_id,
          provider,
          code_verifier,
          redirect_uri,
          ui_origin,
          status,
          error,
          created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `,
      [
        link.linkId,
        link.ownerId,
        link.provider,
        link.codeVerifier ?? null,
        link.redirectUri,
        link.uiOrigin ?? null,
        link.status,
        link.error ?? null,
        toIso(link.createdAt),
      ],
    );
  }

  async get(linkId: string): Promise<PendingOAuthLink | null> {
    const result = await this.pool.query<PendingLinkRow>(
      `
        SELECT
          link_id,
          owner_id,
          provider,
          code_verifier,
          redirect_uri,
          ui_origin,
          status,
          error,
          created_at
        FROM pending_oauth_links
        WHERE link_id = $1
      `,
      [linkId],
    );
    const row = result.rows[0];
    return row ? rowToPendingLink(row) : null;
  }

  async update(link: PendingOAuthLink): Promise<void> {
    await this.pool.query(
      `
        UPDATE pending_oauth_links
        SET
          owner_id = $1,
          provider = $2,
          code_verifier = $3,
          redirect_uri = $4,
          ui_origin = $5,
          status = $6,
          error = $7,
          created_at = $8
        WHERE link_id = $9
      `,
      [
        link.ownerId,
        link.provider,
        link.codeVerifier ?? null,
        link.redirectUri,
        link.uiOrigin ?? null,
        link.status,
        link.error ?? null,
        toIso(link.createdAt),
        link.linkId,
      ],
    );
  }

  async getLatest(
    ownerId: string,
    provider: string,
  ): Promise<PendingOAuthLink | null> {
    const result = await this.pool.query<PendingLinkRow>(
      `
        SELECT
          link_id,
          owner_id,
          provider,
          code_verifier,
          redirect_uri,
          ui_origin,
          status,
          error,
          created_at
        FROM pending_oauth_links
        WHERE owner_id = $1 AND provider = $2
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [ownerId, provider],
    );
    const row = result.rows[0];
    return row ? rowToPendingLink(row) : null;
  }

  async listOwnerIds(): Promise<string[]> {
    const result = await this.pool.query<{ owner_id: string }>(
      `SELECT DISTINCT owner_id FROM pending_oauth_links`,
    );
    return result.rows.map((row) => row.owner_id);
  }

  async deleteByOwner(ownerId: string): Promise<number> {
    const result = await this.pool.query(
      `DELETE FROM pending_oauth_links WHERE owner_id = $1`,
      [ownerId],
    );
    return result.rowCount ?? 0;
  }
}
