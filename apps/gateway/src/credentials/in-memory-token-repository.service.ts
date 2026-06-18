import { injectable } from "tsyringe";
import type { OAuthToken, TokenRepository } from "./types/token-repository.js";

function storageKey(subject: string, provider: string): string {
  return `${subject}:${provider}`;
}

@injectable()
export class InMemoryTokenRepository implements TokenRepository {
  private readonly tokens = new Map<string, OAuthToken>();

  async get(subject: string, provider: string): Promise<OAuthToken | null> {
    return this.tokens.get(storageKey(subject, provider)) ?? null;
  }

  async set(
    subject: string,
    provider: string,
    token: OAuthToken,
  ): Promise<void> {
    this.tokens.set(storageKey(subject, provider), token);
  }
}
