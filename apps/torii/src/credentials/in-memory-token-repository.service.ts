import { injectable } from "tsyringe";
import type {
  OAuthToken,
  StoredOAuthGrant,
  TokenRepository,
} from "./types/token-repository.js";

function storageKey(ownerId: string, provider: string): string {
  return `${ownerId}:${provider}`;
}

@injectable()
export class InMemoryTokenRepository implements TokenRepository {
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
}
