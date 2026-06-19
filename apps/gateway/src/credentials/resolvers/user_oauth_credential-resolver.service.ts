import type { ServerConfig } from "@torii/shared";
import { inject, injectable } from "tsyringe";
import { ToriiConfigService } from "../../config/torii-config.service.js";
import { getAgentPrincipal } from "../../identity/agent-principal-context.js";
import {
  TOKEN_REPOSITORY,
  type OAuthToken,
  type TokenRepository,
} from "../types/token-repository.js";
import type { CredentialStrategyResolver } from "../types/credential-strategy-resolver.js";
import {
  LINKING_REQUIRED_CODE,
  LinkingRequiredError,
  type ResolvedCredentials,
} from "../types/credential-resolution.js";
import { buildOAuthLinkUrl } from "../utils/oauth-link-url.js";

function isExpired(token: OAuthToken): boolean {
  return token.expiresAt !== undefined && token.expiresAt.getTime() <= Date.now();
}

@injectable()
export class UserOAuthCredentialResolver implements CredentialStrategyResolver {
  constructor(
    @inject(TOKEN_REPOSITORY)
    private readonly tokenRepository: TokenRepository,
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
    const token = await this.tokenRepository.get(ownerId, provider);

    if (!token || isExpired(token)) {
      const providerConfig = this.configService.get().oauth_providers[provider];
      if (!providerConfig) {
        throw new Error(
          `user_oauth provider "${provider}" is not defined in oauth_providers`,
        );
      }

      throw new LinkingRequiredError({
        code: LINKING_REQUIRED_CODE,
        provider,
        ownerId,
        backend: server.name,
        linkUrl: buildOAuthLinkUrl(providerConfig, provider, ownerId),
      });
    }

    return {
      headers: {
        Authorization: `Bearer ${token.accessToken}`,
      },
      credentialRef: `${provider}:${ownerId}`,
    };
  }
}
