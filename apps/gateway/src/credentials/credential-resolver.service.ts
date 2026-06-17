import type { ServerConfig } from "@torii/shared";
import { inject, injectable } from "tsyringe";
import { OAuthOboCredentialResolver } from "./oauth-obo-credential-resolver.service.js";
import type { ResolvedCredentials } from "./types/credential-resolution.js";

@injectable()
export class CredentialResolverService {
  constructor(
    @inject(OAuthOboCredentialResolver)
    private readonly oauthOboResolver: OAuthOboCredentialResolver,
  ) {}

  async resolve(server: ServerConfig): Promise<ResolvedCredentials> {
    switch (server.credential.strategy) {
      case "none":
        return { headers: {} };
      case "service_key":
        return {
          headers: {
            Authorization: `Bearer ${server.credential.key}`,
          },
          credentialRef: `service_key:${server.name}`,
        };
      case "oauth_obo":
        return this.oauthOboResolver.resolve(server);
    }
  }
}
