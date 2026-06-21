import type { ServerConfig } from "@keidai/shared";
import { inject, injectable } from "tsyringe";
import { NoneCredentialResolver } from "./resolvers/none-credential-resolver.service.js";
import { UserOAuthCredentialResolver } from "./resolvers/user_oauth_credential-resolver.service.js";
import { ServiceKeyCredentialResolver } from "./resolvers/service-key-credential-resolver.service.js";
import type { ResolvedCredentials } from "./types/credential-resolution.js";

@injectable()
export class CredentialResolverService {
  constructor(
    @inject(NoneCredentialResolver)
    private readonly noneResolver: NoneCredentialResolver,
    @inject(UserOAuthCredentialResolver)
    private readonly userOAuthResolver: UserOAuthCredentialResolver,
    @inject(ServiceKeyCredentialResolver)
    private readonly serviceKeyResolver: ServiceKeyCredentialResolver,
  ) {}

  async resolve(server: ServerConfig): Promise<ResolvedCredentials> {
    switch (server.credential.strategy) {
      case "none":
        return this.noneResolver.resolve(server);
      case "service_key":
        return this.serviceKeyResolver.resolve(server);
      case "user_oauth":
        return this.userOAuthResolver.resolve(server);
    }
  }
}
