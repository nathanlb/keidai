import type {
  OAuthClientRepository,
  OAuthProviderClient,
} from "../../credentials/types/oauth-client-repository.js";

/** @internal Test-only. Not for production use. */
export class MockOAuthClientRepository implements OAuthClientRepository {
  private readonly clients = new Map<string, OAuthProviderClient>();

  async get(provider: string): Promise<OAuthProviderClient | null> {
    return this.clients.get(provider) ?? null;
  }

  async set(provider: string, client: OAuthProviderClient): Promise<void> {
    this.clients.set(provider, client);
  }
}
