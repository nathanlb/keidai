import { CredentialResolverService } from "../credential-resolver.service.js";
import { InMemoryTokenRepository } from "../in-memory-token-repository.service.js";
import { NoneCredentialResolver } from "../resolvers/none-credential-resolver.service.js";
import { DelegatedConnectionCredentialResolver } from "../resolvers/delegated-connection-credential-resolver.service.js";
import { ServiceKeyCredentialResolver } from "../resolvers/service-key-credential-resolver.service.js";
import { runWithAgentPrincipal } from "../../identity/agent-principal-context.js";
import { STUB_AGENT_PRINCIPAL } from "../../identity/stub-agent-principal.js";

export function withStubAgentPrincipal<T>(fn: () => T): T;
export function withStubAgentPrincipal<T>(fn: () => Promise<T>): Promise<T>;
export function withStubAgentPrincipal<T>(fn: () => T | Promise<T>): T | Promise<T> {
  return runWithAgentPrincipal(STUB_AGENT_PRINCIPAL, fn);
}

export function createCredentialServices(): {
  tokenRepository: InMemoryTokenRepository;
  credentialResolver: CredentialResolverService;
} {
  const tokenRepository = new InMemoryTokenRepository();
  const noneResolver = new NoneCredentialResolver();
  const userOAuthResolver = new DelegatedConnectionCredentialResolver(tokenRepository);
  const serviceKeyResolver = new ServiceKeyCredentialResolver();
  const credentialResolver = new CredentialResolverService(
    noneResolver,
    userOAuthResolver,
    serviceKeyResolver,
  );
  return { tokenRepository, credentialResolver };
}
