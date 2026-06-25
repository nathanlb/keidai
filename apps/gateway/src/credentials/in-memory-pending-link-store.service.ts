import { injectable } from "tsyringe";
import type { PendingOAuthLink } from "./types/pending-oauth-link.js";
import type { PendingOAuthLinkStore } from "./types/pending-oauth-link-store.js";

@injectable()
export class InMemoryPendingLinkStore implements PendingOAuthLinkStore {
  private readonly links = new Map<string, PendingOAuthLink>();
  private readonly latestByOwnerProvider = new Map<string, string>();

  async create(link: PendingOAuthLink): Promise<void> {
    this.links.set(link.linkId, { ...link });
    this.latestByOwnerProvider.set(
      ownerProviderKey(link.ownerId, link.provider),
      link.linkId,
    );
  }

  async get(linkId: string): Promise<PendingOAuthLink | null> {
    const link = this.links.get(linkId);
    return link ? { ...link } : null;
  }

  async update(link: PendingOAuthLink): Promise<void> {
    this.links.set(link.linkId, { ...link });
  }

  async getLatest(
    ownerId: string,
    provider: string,
  ): Promise<PendingOAuthLink | null> {
    const linkId = this.latestByOwnerProvider.get(
      ownerProviderKey(ownerId, provider),
    );
    if (!linkId) {
      return null;
    }
    return this.get(linkId);
  }
}

function ownerProviderKey(ownerId: string, provider: string): string {
  return `${ownerId}:${provider}`;
}
