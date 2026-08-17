import type {
  OAuthToken,
  StoredOAuthGrant,
  TokenRepository,
} from "../../credentials/types/token-repository.js";

function storageKey(ownerId: string, provider: string): string {
  return `${ownerId}:${provider}`;
}

/** @internal Test-only. Not for production use. */
export class MockTokenRepository implements TokenRepository {
  private readonly tokens = new Map<string, OAuthToken>();

  async get(ownerId: string, provider: string): Promise<OAuthToken | null> {
    return this.tokens.get(storageKey(ownerId, provider)) ?? null;
  }

  async set(
    ownerId: string,
    provider: string,
    token: OAuthToken,
  ): Promise<void> {
    this.tokens.set(storageKey(ownerId, provider), token);
  }

  async delete(ownerId: string, provider: string): Promise<boolean> {
    return this.tokens.delete(storageKey(ownerId, provider));
  }

  async listByOwner(ownerId: string): Promise<StoredOAuthGrant[]> {
    const prefix = `${ownerId}:`;
    const grants: StoredOAuthGrant[] = [];
    for (const [key, token] of this.tokens.entries()) {
      if (!key.startsWith(prefix)) {
        continue;
      }
      grants.push({
        provider: key.slice(prefix.length),
        token,
      });
    }
    return grants;
  }

  async listOwnerIds(): Promise<string[]> {
    const ownerIds = new Set<string>();
    for (const key of this.tokens.keys()) {
      const separator = key.indexOf(":");
      if (separator > 0) {
        ownerIds.add(key.slice(0, separator));
      }
    }
    return [...ownerIds];
  }

  async deleteByOwner(ownerId: string): Promise<number> {
    const prefix = `${ownerId}:`;
    let deleted = 0;
    for (const key of [...this.tokens.keys()]) {
      if (!key.startsWith(prefix)) {
        continue;
      }
      this.tokens.delete(key);
      deleted += 1;
    }
    return deleted;
  }
}
