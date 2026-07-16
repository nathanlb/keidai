import type { DatabaseSync } from "node:sqlite";
import { injectable } from "tsyringe";
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
  created_at: string;
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

@injectable()
export class SqlitePendingLinkStore implements PendingOAuthLinkStore {
  private readonly insertStatement;
  private readonly getStatement;
  private readonly updateStatement;
  private readonly getLatestStatement;

  constructor(private readonly db: DatabaseSync) {
    this.insertStatement = db.prepare(`
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
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    this.getStatement = db.prepare(`
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
      WHERE link_id = ?
    `);
    this.updateStatement = db.prepare(`
      UPDATE pending_oauth_links
      SET
        owner_id = ?,
        provider = ?,
        code_verifier = ?,
        redirect_uri = ?,
        ui_origin = ?,
        status = ?,
        error = ?,
        created_at = ?
      WHERE link_id = ?
    `);
    this.getLatestStatement = db.prepare(`
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
      WHERE owner_id = ? AND provider = ?
      ORDER BY created_at DESC
      LIMIT 1
    `);
  }

  async create(link: PendingOAuthLink): Promise<void> {
    this.insertStatement.run(
      link.linkId,
      link.ownerId,
      link.provider,
      link.codeVerifier ?? null,
      link.redirectUri,
      link.uiOrigin ?? null,
      link.status,
      link.error ?? null,
      link.createdAt.toISOString(),
    );
  }

  async get(linkId: string): Promise<PendingOAuthLink | null> {
    const row = this.getStatement.get(linkId) as PendingLinkRow | undefined;
    return row ? rowToPendingLink(row) : null;
  }

  async update(link: PendingOAuthLink): Promise<void> {
    this.updateStatement.run(
      link.ownerId,
      link.provider,
      link.codeVerifier ?? null,
      link.redirectUri,
      link.uiOrigin ?? null,
      link.status,
      link.error ?? null,
      link.createdAt.toISOString(),
      link.linkId,
    );
  }

  async getLatest(
    ownerId: string,
    provider: string,
  ): Promise<PendingOAuthLink | null> {
    const row = this.getLatestStatement.get(ownerId, provider) as
      | PendingLinkRow
      | undefined;
    return row ? rowToPendingLink(row) : null;
  }
}
