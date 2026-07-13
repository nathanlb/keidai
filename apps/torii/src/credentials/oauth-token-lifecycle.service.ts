import type { OAuthProviderConfig } from "@keidai/shared";
import { inject, injectable } from "tsyringe";
import { ToriiConfigService } from "../config/torii-config.service.js";
import {
  OAuthTokenRefreshError,
  refreshOAuthToken,
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
import { resolveOAuthProviderConfig } from "./utils/resolve-oauth-provider-config.js";

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
    const providerConfig = await resolveOAuthProviderConfig(
      provider,
      this.getProviderConfig(provider),
      this.clientRepository,
    );
    const refreshToken = staleToken.refreshToken;
    if (!refreshToken) {
      throw new OAuthTokenRefreshError(
        "Cannot refresh OAuth token without refresh_token",
        true,
      );
    }

    const refreshedToken = await refreshOAuthToken(
      providerConfig,
      refreshToken,
    );

    await this.tokenRepository.set(ownerId, provider, refreshedToken);
    return refreshedToken;
  }

  private getProviderConfig(provider: string): OAuthProviderConfig {
    const providerConfig = this.configService.get().oauth_providers[provider];
    if (!providerConfig) {
      throw new Error(
        `user_oauth provider "${provider}" is not defined in oauth_providers`,
      );
    }
    return providerConfig;
  }
}
