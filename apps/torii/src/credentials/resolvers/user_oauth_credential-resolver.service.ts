import type { ServerConfig } from "@keidai/shared";
import { inject, injectable } from "tsyringe";
import { ToriiConfigService } from "../../config/torii-config.service.js";
import { resolveGatewayBaseUrl } from "../../config/utils/resolve-gateway-base-url.js";
import { buildOAuthCallbackRedirectUri } from "../utils/oauth-callback-redirect-uri.js";
import { getAgentPrincipal } from "../../identity/agent-principal-context.js";
import { OAuthTokenLifecycleService } from "../oauth-token-lifecycle.service.js";
import { OAuthTokenRefreshError } from "../utils/oauth-token-refresh.js";
import type { CredentialStrategyResolver } from "../types/credential-strategy-resolver.js";
import {
  LINKING_REQUIRED_CODE,
  LinkingRequiredError,
  type ResolvedCredentials,
} from "../types/credential-resolution.js";
import { buildOAuthLinkUrl } from "../utils/oauth-link-url.js";

@injectable()
export class UserOAuthCredentialResolver implements CredentialStrategyResolver {
  constructor(
    @inject(OAuthTokenLifecycleService)
    private readonly tokenLifecycle: OAuthTokenLifecycleService,
    @inject(ToriiConfigService)
    private readonly configService: ToriiConfigService,
  ) {}

  async resolve(server: ServerConfig): Promise<ResolvedCredentials> {
    if (server.credential.strategy !== "user_oauth") {
      throw new Error(
        `DelegatedConnectionCredentialResolver cannot handle strategy "${server.credential.strategy}"`,
      );
    }

    const { provider } = server.credential;
    const { ownerId } = getAgentPrincipal();

    let token;
    try {
      token = await this.tokenLifecycle.getValidToken(ownerId, provider);
    } catch (error) {
      if (error instanceof OAuthTokenRefreshError && error.terminal) {
        throw this.linkingRequiredError(provider, ownerId, server.name);
      }
      throw error;
    }

    if (!token) {
      throw this.linkingRequiredError(provider, ownerId, server.name);
    }

    return {
      headers: {
        Authorization: `Bearer ${token.accessToken}`,
      },
      credentialRef: `${provider}:${ownerId}`,
    };
  }

  private linkingRequiredError(
    provider: string,
    ownerId: string,
    backend: string,
  ): LinkingRequiredError {
    const config = this.configService.get();
    const providerConfig = config.oauth_providers[provider];
    if (!providerConfig) {
      throw new Error(
        `user_oauth provider "${provider}" is not defined in oauth_providers`,
      );
    }

    const redirectUri = buildOAuthCallbackRedirectUri(
      resolveGatewayBaseUrl(config),
      provider,
    );

    return new LinkingRequiredError({
      code: LINKING_REQUIRED_CODE,
      provider,
      ownerId,
      backend,
      linkUrl: buildOAuthLinkUrl(providerConfig, provider, ownerId, {
        redirectUri,
      }),
    });
  }
}
