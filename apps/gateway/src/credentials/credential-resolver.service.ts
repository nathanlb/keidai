import type { ServerConfig } from "@torii/shared";
import { inject, injectable } from "tsyringe";
import { NoneCredentialResolver } from "./resolvers/none-credential-resolver.service.js";
import { DelegatedConnectionCredentialResolver } from "./resolvers/delegated-connection-credential-resolver.service.js";
import { ServiceKeyCredentialResolver } from "./resolvers/service-key-credential-resolver.service.js";
import type { ResolvedCredentials } from "./types/credential-resolution.js";

@injectable()
export class CredentialResolverService {
  constructor(
    @inject(NoneCredentialResolver)
    private readonly noneResolver: NoneCredentialResolver,
    @inject(DelegatedConnectionCredentialResolver)
    private readonly userOAuthResolver: DelegatedConnectionCredentialResolver,
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
