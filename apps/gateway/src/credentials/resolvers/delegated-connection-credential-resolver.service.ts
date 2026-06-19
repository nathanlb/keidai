import type { ServerConfig } from "@torii/shared";
import { inject, injectable } from "tsyringe";
import { getAgentPrincipal } from "../../identity/agent-principal-context.js";
import {
  TOKEN_REPOSITORY,
  type OAuthToken,
  type TokenRepository,
} from "../types/token-repository.js";
import type { CredentialStrategyResolver } from "../types/credential-strategy-resolver.js";
import {
  CredentialResolutionError,
  type ResolvedCredentials,
} from "../types/credential-resolution.js";

function isExpired(token: OAuthToken): boolean {
  return token.expiresAt !== undefined && token.expiresAt.getTime() <= Date.now();
}

@injectable()
export class DelegatedConnectionCredentialResolver implements CredentialStrategyResolver {
  constructor(
    @inject(TOKEN_REPOSITORY)
    private readonly tokenRepository: TokenRepository,
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
      throw new CredentialResolutionError(
        `No valid OAuth token for provider "${provider}" and owner "${ownerId}" (backend "${server.name}")`,
      );
    }

    return {
      headers: {
        Authorization: `Bearer ${token.accessToken}`,
      },
      credentialRef: `${provider}:${ownerId}`,
    };
  }
}
