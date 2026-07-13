import type { PendingOAuthLink } from "./pending-oauth-link.js";

export interface PendingOAuthLinkStore {
  create(link: PendingOAuthLink): Promise<void>;
  get(linkId: string): Promise<PendingOAuthLink | null>;
  update(link: PendingOAuthLink): Promise<void>;
  getLatest(
    ownerId: string,
    provider: string,
  ): Promise<PendingOAuthLink | null>;
}

/** tsyringe injection token for {@link PendingOAuthLinkStore}. */
export const PENDING_OAUTH_LINK_STORE = Symbol("PendingOAuthLinkStore");
