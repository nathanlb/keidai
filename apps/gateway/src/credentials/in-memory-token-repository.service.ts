import { injectable } from "tsyringe";
import type { OAuthToken, TokenRepository } from "./types/token-repository.js";

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
}
