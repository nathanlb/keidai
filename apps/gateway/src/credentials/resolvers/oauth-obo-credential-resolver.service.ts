import type { ServerConfig } from "@torii/shared";
import { inject, injectable } from "tsyringe";
import { InMemoryTokenRepository } from "../in-memory-token-repository.service.js";
import {
  CredentialResolutionError,
  type ResolvedCredentials,
} from "../types/credential-resolution.js";
import type { OAuthToken } from "../types/token-repository.js";
import type { CredentialStrategyResolver } from "../types/credential-strategy-resolver.js";
import { STUB_OBO_SUBJECT } from "../utils/obo-subject.js";

function isExpired(token: OAuthToken): boolean {
  return token.expiresAt !== undefined && token.expiresAt.getTime() <= Date.now();
}

@injectable()
export class OAuthOboCredentialResolver implements CredentialStrategyResolver {
  constructor(
    @inject(InMemoryTokenRepository)
    private readonly tokenRepository: InMemoryTokenRepository,
  ) {}

  async resolve(server: ServerConfig): Promise<ResolvedCredentials> {
    if (server.credential.strategy !== "oauth_obo") {
      throw new Error(
        `OAuthOboCredentialResolver cannot handle strategy "${server.credential.strategy}"`,
      );
    }

    const { provider } = server.credential;
    const subject = STUB_OBO_SUBJECT;
    const token = await this.tokenRepository.get(subject, provider);

    if (!token || isExpired(token)) {
      throw new CredentialResolutionError(
        `No valid OAuth token for provider "${provider}" and subject "${subject}" (backend "${server.name}")`,
      );
    }

    return {
      headers: {
        Authorization: `Bearer ${token.accessToken}`,
      },
      credentialRef: `${provider}:${subject}`,
    };
  }
}
