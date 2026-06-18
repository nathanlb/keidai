import type { ServerConfig } from "@torii/shared";
import { inject, injectable } from "tsyringe";
import { OAuthOboCredentialResolver } from "./oauth-obo-credential-resolver.service.js";
import { ServiceKeyCredentialResolver } from "./service-key-credential-resolver.service.js";
import type { ResolvedCredentials } from "./types/credential-resolution.js";

@injectable()
export class CredentialResolverService {
  constructor(
    @inject(OAuthOboCredentialResolver)
    private readonly oauthOboResolver: OAuthOboCredentialResolver,
    @inject(ServiceKeyCredentialResolver)
    private readonly serviceKeyResolver: ServiceKeyCredentialResolver,
  ) {}

  async resolve(server: ServerConfig): Promise<ResolvedCredentials> {
    switch (server.credential.strategy) {
      case "none":
        return { headers: {} };
      case "service_key":
        return this.serviceKeyResolver.resolve(server);
      case "oauth_obo":
        return this.oauthOboResolver.resolve(server);
    }
  }
}
