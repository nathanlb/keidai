import type { ToriiConfig } from "@torii/shared";
import { ToriiConfigService } from "../../config/torii-config.service.js";
import { CredentialResolverService } from "../credential-resolver.service.js";
import { OAuthTokenLifecycleService } from "../oauth-token-lifecycle.service.js";
import { InMemoryTokenRepository } from "../in-memory-token-repository.service.js";
import type { TokenRepository } from "../types/token-repository.js";
import { NoneCredentialResolver } from "../resolvers/none-credential-resolver.service.js";
import { UserOAuthCredentialResolver } from "../resolvers/user_oauth_credential-resolver.service.js";
import { ServiceKeyCredentialResolver } from "../resolvers/service-key-credential-resolver.service.js";
import { runWithAgentPrincipal } from "../../identity/agent-principal-context.js";
import { STUB_AGENT_PRINCIPAL } from "../../identity/stub-agent-principal.js";

export function withStubAgentPrincipal<T>(fn: () => T): T;
export function withStubAgentPrincipal<T>(fn: () => Promise<T>): Promise<T>;
export function withStubAgentPrincipal<T>(fn: () => T | Promise<T>): T | Promise<T> {
  return runWithAgentPrincipal(STUB_AGENT_PRINCIPAL, fn);
}

const defaultOAuthProviders: ToriiConfig["oauth_providers"] = {
  github: {
    token_url: "https://github.com/login/oauth/access_token",
    client_id: "test-client-id",
    client_secret: "secret",
    scopes: ["repo"],
    redirect_uri: "http://localhost:3100/oauth/callback",
  },
};

export function createCredentialServices(
  config: Pick<ToriiConfig, "oauth_providers"> = {
    oauth_providers: defaultOAuthProviders,
  },
): {
  tokenRepository: TokenRepository;
  credentialResolver: CredentialResolverService;
  configService: ToriiConfigService;
} {
  const tokenRepository = new InMemoryTokenRepository();
  const configService = new ToriiConfigService({
    oauth_providers: config.oauth_providers,
    servers: [],
  });
  const noneResolver = new NoneCredentialResolver();
  const tokenLifecycle = new OAuthTokenLifecycleService(
    tokenRepository,
    configService,
  );
  const userOAuthResolver = new UserOAuthCredentialResolver(
    tokenLifecycle,
    configService,
  );
  const serviceKeyResolver = new ServiceKeyCredentialResolver();
  const credentialResolver = new CredentialResolverService(
    noneResolver,
    userOAuthResolver,
    serviceKeyResolver,
  );
  return { tokenRepository, credentialResolver, configService };
}
