import type { PendingOAuthLink } from "../../credentials/types/pending-oauth-link.js";
import type { PendingOAuthLinkStore } from "../../credentials/types/pending-oauth-link-store.js";

/** @internal Test-only. Not for production use. */
export class MockPendingLinkStore implements PendingOAuthLinkStore {
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

  async listOwnerIds(): Promise<string[]> {
    const ownerIds = new Set<string>();
    for (const link of this.links.values()) {
      ownerIds.add(link.ownerId);
    }
    return [...ownerIds];
  }

  async deleteByOwner(ownerId: string): Promise<number> {
    let deleted = 0;
    for (const [linkId, link] of [...this.links.entries()]) {
      if (link.ownerId !== ownerId) {
        continue;
      }
      this.links.delete(linkId);
      deleted += 1;
    }
    for (const key of [...this.latestByOwnerProvider.keys()]) {
      if (key.startsWith(`${ownerId}:`)) {
        this.latestByOwnerProvider.delete(key);
      }
    }
    return deleted;
  }
}

function ownerProviderKey(ownerId: string, provider: string): string {
  return `${ownerId}:${provider}`;
}
