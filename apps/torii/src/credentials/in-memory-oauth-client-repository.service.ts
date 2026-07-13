import type {
  OAuthClientRepository,
  OAuthProviderClient,
} from "./types/oauth-client-repository.js";

export class InMemoryOAuthClientRepository implements OAuthClientRepository {
  private readonly clients = new Map<string, OAuthProviderClient>();

  async get(provider: string): Promise<OAuthProviderClient | null> {
    return this.clients.get(provider) ?? null;
  }

  async set(provider: string, client: OAuthProviderClient): Promise<void> {
    this.clients.set(provider, client);
  }
}
