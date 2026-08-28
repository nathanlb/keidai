import type { ConnectorRecord } from "@keidai/shared";
import { inject, injectable } from "tsyringe";
import { ToriiConfigService } from "../config/torii-config.service.js";
import {
  isTerminalOAuthFailure,
  OAuthTokenRefreshError,
} from "./utils/oauth-token-refresh.js";
import {
  TOKEN_REPOSITORY,
  type OAuthToken,
  type TokenRepository,
} from "./types/token-repository.js";
import {
  OAUTH_CLIENT_REPOSITORY,
  type OAuthClientRepository,
} from "./types/oauth-client-repository.js";
import {
  resolveSecretPayload,
  SECRET_REPOSITORY,
  type SecretRepository,
} from "../secrets/secret-store.js";
import { PgOAuthDiscoveryCache } from "./pg-oauth-discovery-cache.service.js";
import { PgOAuthRegistrationRepository } from "./pg-oauth-registration-repository.service.js";
import {
  clientInformationFrom,
  refreshSdkAuthorization,
  resolveOAuthServer,
} from "./utils/sdk-oauth.js";

function isExpired(token: OAuthToken): boolean {
  return token.expiresAt !== undefined && token.expiresAt.getTime() <= Date.now();
}

function refreshLockKey(ownerId: string, provider: string): string {
  return `${ownerId}:${provider}`;
}

@injectable()
export class OAuthTokenLifecycleService {
  private readonly inFlightRefreshes = new Map<string, Promise<OAuthToken>>();

  constructor(
    @inject(TOKEN_REPOSITORY)
    private readonly tokenRepository: TokenRepository,
    @inject(OAUTH_CLIENT_REPOSITORY)
    private readonly clientRepository: OAuthClientRepository,
    @inject(ToriiConfigService)
    private readonly configService: ToriiConfigService,
    @inject(PgOAuthRegistrationRepository)
    private readonly registrations?: PgOAuthRegistrationRepository,
    @inject(SECRET_REPOSITORY)
    private readonly secrets?: SecretRepository,
    @inject(PgOAuthDiscoveryCache)
    private readonly discoveryCache?: PgOAuthDiscoveryCache,
  ) {}

  async getValidToken(
    ownerId: string,
    provider: string,
  ): Promise<OAuthToken | null> {
    const token = await this.tokenRepository.get(ownerId, provider);
    if (!token) {
      return null;
    }

    if (!isExpired(token)) {
      return token;
    }

    if (!token.refreshToken) {
      return null;
    }

    return this.refreshWithSingleFlight(ownerId, provider, token);
  }

  private refreshWithSingleFlight(
    ownerId: string,
    provider: string,
    staleToken: OAuthToken,
  ): Promise<OAuthToken> {
    const key = refreshLockKey(ownerId, provider);
    const inFlight = this.inFlightRefreshes.get(key);
    if (inFlight) {
      return inFlight;
    }

    const refreshPromise = this.performRefresh(ownerId, provider, staleToken);
    this.inFlightRefreshes.set(key, refreshPromise);

    return refreshPromise.finally(() => {
      if (this.inFlightRefreshes.get(key) === refreshPromise) {
        this.inFlightRefreshes.delete(key);
      }
    });
  }

  private async performRefresh(
    ownerId: string,
    provider: string,
    staleToken: OAuthToken,
  ): Promise<OAuthToken> {
    const connector = this.findConnector(provider);
    if (!connector) {
      throw new Error(
        `user_oauth provider "${provider}" is not defined`,
      );
    }
    const refreshToken = staleToken.refreshToken;
    if (!refreshToken) {
      throw new OAuthTokenRefreshError(
        "Cannot refresh OAuth token without refresh_token",
        true,
      );
    }

    try {
      const server = await resolveOAuthServer(connector, this.discoveryCache);
      const clientId =
        connector.oauth?.clientId && connector.oauth.clientSecret
          ? connector.oauth.clientId
          : undefined;
      const clientSecret =
        clientId !== undefined ? connector.oauth?.clientSecret : undefined;
      const fromIssuer =
        clientId === undefined
          ? await this.loadIssuerClient(server.issuer)
          : undefined;
      const legacy =
        clientId === undefined && fromIssuer === undefined
          ? await this.clientRepository.get(provider)
          : undefined;
      const resolvedClientId =
        clientId ?? fromIssuer?.clientId ?? legacy?.clientId;
      const resolvedSecret =
        clientSecret ?? fromIssuer?.clientSecret ?? legacy?.clientSecret;
      if (!resolvedClientId) {
        throw new OAuthTokenRefreshError(
          `No OAuth client is registered for "${provider}"`,
          true,
        );
      }
      const refreshedToken = await refreshSdkAuthorization({
        authorizationServerUrl: server.authorizationServerUrl,
        metadata: server.metadata,
        client: clientInformationFrom(resolvedClientId, resolvedSecret),
        refreshToken,
        resource: server.resource,
      });
      await this.tokenRepository.set(ownerId, provider, refreshedToken);
      return refreshedToken;
    } catch (error) {
      if (error instanceof OAuthTokenRefreshError) {
        throw error;
      }
      const message =
        error instanceof Error ? error.message : "OAuth token refresh failed";
      throw new OAuthTokenRefreshError(
        message,
        isTerminalOAuthFailure(error),
      );
    }
  }

  private async loadIssuerClient(
    issuer: string,
  ): Promise<{ clientId: string; clientSecret?: string } | undefined> {
    if (!this.registrations) {
      return undefined;
    }
    const row = await this.registrations.get(issuer);
    if (!row) {
      return undefined;
    }
    let clientSecret: string | undefined;
    if (row.clientSecretRef && this.secrets) {
      const stored = await this.secrets.get(row.clientSecretRef);
      if (stored) {
        clientSecret = await resolveSecretPayload(stored);
      }
    }
    return { clientId: row.clientId, clientSecret };
  }

  private findConnector(provider: string): ConnectorRecord | undefined {
    const registry = this.configService.getRegistry();
    return (
      registry.find(provider) ??
      registry
        .get()
        .find((connector) => connector.oauth?.providerKey === provider)
    );
  }
}
