import { CredentialResolverService } from "../credential-resolver.service.js";
import { InMemoryTokenRepository } from "../in-memory-token-repository.service.js";
import { NoneCredentialResolver } from "../resolvers/none-credential-resolver.service.js";
import { OAuthOboCredentialResolver } from "../resolvers/oauth-obo-credential-resolver.service.js";
import { ServiceKeyCredentialResolver } from "../resolvers/service-key-credential-resolver.service.js";

export function createCredentialServices(): {
  tokenRepository: InMemoryTokenRepository;
  credentialResolver: CredentialResolverService;
} {
  const tokenRepository = new InMemoryTokenRepository();
  const noneResolver = new NoneCredentialResolver();
  const oauthOboResolver = new OAuthOboCredentialResolver(tokenRepository);
  const serviceKeyResolver = new ServiceKeyCredentialResolver();
  const credentialResolver = new CredentialResolverService(
    noneResolver,
    oauthOboResolver,
    serviceKeyResolver,
  );
  return { tokenRepository, credentialResolver };
}
