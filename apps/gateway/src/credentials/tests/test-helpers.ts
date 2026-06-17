import { CredentialResolverService } from "../credential-resolver.service.js";
import { InMemoryTokenRepository } from "../in-memory-token-repository.service.js";
import { OAuthOboCredentialResolver } from "../oauth-obo-credential-resolver.service.js";

export function createCredentialServices(): {
  tokenRepository: InMemoryTokenRepository;
  credentialResolver: CredentialResolverService;
} {
  const tokenRepository = new InMemoryTokenRepository();
  const oauthOboResolver = new OAuthOboCredentialResolver(tokenRepository);
  const credentialResolver = new CredentialResolverService(oauthOboResolver);
  return { tokenRepository, credentialResolver };
}
