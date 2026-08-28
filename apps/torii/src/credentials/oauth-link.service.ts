import { randomUUID } from "node:crypto";
import type { ConnectorRecord, OAuthInitiateResponse } from "@keidai/shared";
import { inject, injectable } from "tsyringe";
import { ToriiConfigService } from "../config/torii-config.service.js";
import { StructuredLoggerService } from "../logging/structured-logger.service.js";
import type { Logger } from "@keidai/shared";
import {
  createSealedSecret,
  resolveSecretPayload,
  SECRET_REPOSITORY,
  type SecretRepository,
} from "../secrets/secret-store.js";
import {
  OAUTH_CLIENT_REPOSITORY,
  type OAuthClientRepository,
} from "./types/oauth-client-repository.js";
import { PgOAuthDiscoveryCache } from "./pg-oauth-discovery-cache.service.js";
import { PgOAuthRegistrationRepository } from "./pg-oauth-registration-repository.service.js";
import type { PendingOAuthLink } from "./types/pending-oauth-link.js";
import {
  PENDING_OAUTH_LINK_STORE,
  type PendingOAuthLinkStore,
} from "./types/pending-oauth-link-store.js";
import {
  TOKEN_REPOSITORY,
  type TokenRepository,
} from "./types/token-repository.js";
import { decodeOAuthLinkState, encodeOAuthLinkState, type OAuthLinkState } from "./utils/oauth-link-state.js";
import { buildOAuthCallbackRedirectUri } from "./utils/oauth-callback-redirect-uri.js";
import { resolveOAuthOwnerId } from "./utils/resolve-oauth-owner.js";
import {
  clientInformationFrom,
  exchangeSdkAuthorization,
  registerSdkClient,
  resolveOAuthServer,
  startSdkAuthorization,
  type ResolvedOAuthServer,
} from "./utils/sdk-oauth.js";

export interface OAuthCallbackQuery {
  code?: string;
  state?: string;
  error?: string;
  error_description?: string;
}

export interface OAuthCallbackResult {
  success: boolean;
  error?: string;
  page?: {
    uiOrigin?: string;
    linkId?: string;
    provider: string;
    status: "success" | "error";
    error?: string;
  };
}

interface CallbackError {
  success: false;
  error: string;
}

interface ResolvedCallbackContext {
  code: string;
  pendingLink: PendingOAuthLink;
}

function isCallbackError(
  result:
    | { success?: boolean }
    | ResolvedCallbackContext
    | OAuthLinkState,
): result is CallbackError {
  return "success" in result && result.success === false;
}

@injectable()
export class OAuthLinkService {
  constructor(
    @inject(ToriiConfigService)
    private readonly configService: ToriiConfigService,
    @inject(TOKEN_REPOSITORY)
    private readonly tokenRepository: TokenRepository,
    @inject(OAUTH_CLIENT_REPOSITORY)
    private readonly clientRepository: OAuthClientRepository,
    @inject(PENDING_OAUTH_LINK_STORE)
    private readonly pendingLinkStore: PendingOAuthLinkStore,
    @inject(StructuredLoggerService)
    private readonly logger: Logger,
    @inject(PgOAuthRegistrationRepository)
    private readonly registrations?: PgOAuthRegistrationRepository,
    @inject(SECRET_REPOSITORY)
    private readonly secrets?: SecretRepository,
    @inject(PgOAuthDiscoveryCache)
    private readonly discoveryCache?: PgOAuthDiscoveryCache,
  ) {}

  async initiate(
    provider: string,
    baseUrl: string,
    ownerId?: string,
    uiOrigin?: string,
  ): Promise<OAuthInitiateResponse> {
    const connector = this.findConnector(provider);
    if (!connector) {
      throw new Error(
        `Unknown OAuth provider "${provider}". Defined providers: ${this.knownProviderNames().join(", ") || "(none)"}`,
      );
    }

    const resolvedOwnerId = resolveOAuthOwnerId(ownerId);
    const redirectUri = buildOAuthCallbackRedirectUri(baseUrl, provider);
    const server = await resolveOAuthServer(connector, this.discoveryCache);
    const client = await this.ensureClient(
      provider,
      connector,
      server,
      redirectUri,
    );
    const linkId = randomUUID();
    const state = encodeOAuthLinkState({
      ownerId: resolvedOwnerId,
      provider,
      linkId,
    });
    const scopes = connector.oauth?.scopes ?? [];
    const started = await startSdkAuthorization({
      authorizationServerUrl: server.authorizationServerUrl,
      metadata: server.metadata,
      client,
      redirectUri,
      state,
      scope: scopes.length > 0 ? scopes.join(" ") : undefined,
      resource: server.resource,
    });
    const authorizationUrl = appendAuthorizeParams(
      started.authorizationUrl,
      connector.oauth?.authorizeParams,
    );

    await this.pendingLinkStore.create({
      linkId,
      ownerId: resolvedOwnerId,
      provider,
      codeVerifier: started.codeVerifier,
      redirectUri,
      ...(uiOrigin ? { uiOrigin } : {}),
      status: "pending",
      createdAt: new Date(),
    });

    this.logger.info("oauth.initiated", {
      provider,
      ownerId: resolvedOwnerId,
    });

    return { authorizationUrl, linkId, redirectUri };
  }

  async completeCallback(
    provider: string,
    query: OAuthCallbackQuery,
  ): Promise<OAuthCallbackResult> {
    if (query.error) {
      const error =
        query.error_description ?? query.error ?? "Authorization denied";
      const ownerId = this.tryResolveOwnerIdFromState(query.state);
      this.logger.warn("oauth.callback_failed", {
        provider,
        ...(ownerId ? { ownerId } : {}),
        error,
      });
      const notify = await this.failLatestLink(provider, query.state, error);
      return {
        success: false,
        error,
        page: notify,
      };
    }

    const resolved = await this.resolveCallbackContext(provider, query);
    if (isCallbackError(resolved)) {
      const ownerId = this.tryResolveOwnerIdFromState(query.state);
      this.logger.warn("oauth.callback_failed", {
        provider,
        ...(ownerId ? { ownerId } : {}),
        error: resolved.error,
      });
      const page = await this.callbackPageFromState(provider, query.state, "error", resolved.error);
      return { ...resolved, page };
    }

    return this.exchangeAndStoreToken(provider, resolved);
  }

  async unlink(provider: string, ownerId?: string): Promise<boolean> {
    if (!this.findConnector(provider)) {
      throw new Error(`Unknown OAuth provider "${provider}"`);
    }

    const resolvedOwnerId = resolveOAuthOwnerId(ownerId);
    const removed = await this.tokenRepository.delete(resolvedOwnerId, provider);
    if (removed) {
      this.logger.info("oauth.unlinked", {
        provider,
        ownerId: resolvedOwnerId,
      });
    }
    return removed;
  }

  private async resolveCallbackContext(
    provider: string,
    query: OAuthCallbackQuery,
  ): Promise<CallbackError | ResolvedCallbackContext> {
    if (!query.code || !query.state) {
      return { success: false, error: "OAuth callback missing code or state" };
    }

    const decodedState = this.decodeCallbackState(query.state);
    if (isCallbackError(decodedState)) {
      return decodedState;
    }

    if (decodedState.provider !== provider) {
      return this.callbackFailure(
        `OAuth callback provider "${decodedState.provider}" does not match "${provider}"`,
        decodedState.linkId,
      );
    }

    if (!decodedState.linkId) {
      return {
        success: false,
        error: "OAuth callback has no matching pending link",
      };
    }

    const pendingLink = await this.pendingLinkStore.get(decodedState.linkId);
    if (!pendingLink) {
      return {
        success: false,
        error: "OAuth callback has no matching pending link",
      };
    }

    if (pendingLink.status !== "pending") {
      return {
        success: false,
        error: `OAuth link is already ${pendingLink.status}`,
      };
    }

    if (pendingLink.ownerId !== decodedState.ownerId) {
      return this.callbackFailure(
        "OAuth callback owner does not match pending link",
        pendingLink.linkId,
      );
    }

    return { code: query.code, pendingLink };
  }

  private decodeCallbackState(
    state: string,
  ): OAuthLinkState | CallbackError {
    try {
      return decodeOAuthLinkState(state);
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Invalid OAuth state",
      };
    }
  }

  private async exchangeAndStoreToken(
    provider: string,
    { code, pendingLink }: ResolvedCallbackContext,
  ): Promise<OAuthCallbackResult> {
    const connector = this.findConnector(provider);
    if (!connector) {
      return this.callbackFailure(
        `Unknown OAuth provider "${provider}"`,
        pendingLink.linkId,
      );
    }

    try {
      const server = await resolveOAuthServer(connector, this.discoveryCache);
      const client = await this.ensureClient(
        provider,
        connector,
        server,
        pendingLink.redirectUri,
      );
      const token = await exchangeSdkAuthorization({
        authorizationServerUrl: server.authorizationServerUrl,
        metadata: server.metadata,
        client,
        code,
        codeVerifier: pendingLink.codeVerifier ?? "",
        redirectUri: pendingLink.redirectUri,
        resource: server.resource,
      });
      await this.tokenRepository.set(pendingLink.ownerId, provider, token);
      await this.pendingLinkStore.update({
        ...pendingLink,
        status: "completed",
      });
      this.logger.info("oauth.callback_success", {
        provider,
        ownerId: pendingLink.ownerId,
      });
      return {
        success: true,
        page: this.callbackPageFromPendingLink(pendingLink, "success"),
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "OAuth code exchange failed";
      this.logger.warn("oauth.callback_failed", {
        provider,
        ownerId: pendingLink.ownerId,
        error: message,
      });
      const failure = await this.callbackFailure(message, pendingLink.linkId);
      return {
        ...failure,
        page: this.callbackPageFromPendingLink(pendingLink, "error", message),
      };
    }
  }

  private callbackPageFromPendingLink(
    pendingLink: PendingOAuthLink,
    status: "success" | "error",
    error?: string,
  ): OAuthCallbackResult["page"] {
    return {
      uiOrigin: pendingLink.uiOrigin,
      linkId: pendingLink.linkId,
      provider: pendingLink.provider,
      status,
      ...(error ? { error } : {}),
    };
  }

  private async callbackPageFromState(
    provider: string,
    state: string | undefined,
    status: "success" | "error",
    error?: string,
  ): Promise<OAuthCallbackResult["page"]> {
    if (!state) {
      return { provider, status, ...(error ? { error } : {}) };
    }

    try {
      const decodedState = decodeOAuthLinkState(state);
      if (!decodedState.linkId) {
        return { provider, status, ...(error ? { error } : {}) };
      }

      const pendingLink = await this.pendingLinkStore.get(decodedState.linkId);
      if (!pendingLink) {
        return {
          provider,
          linkId: decodedState.linkId,
          status,
          ...(error ? { error } : {}),
        };
      }

      return this.callbackPageFromPendingLink(pendingLink, status, error);
    } catch {
      return { provider, status, ...(error ? { error } : {}) };
    }
  }

  private tryResolveOwnerIdFromState(state: string | undefined): string | undefined {
    if (!state) {
      return undefined;
    }

    try {
      return decodeOAuthLinkState(state).ownerId;
    } catch {
      return undefined;
    }
  }

  private async callbackFailure(
    error: string,
    linkId?: string,
  ): Promise<CallbackError> {
    await this.markLinkFailed(linkId, error);
    return { success: false, error };
  }

  private async failLatestLink(
    provider: string,
    state: string | undefined,
    message: string,
  ): Promise<OAuthCallbackResult["page"]> {
    if (!state) {
      return { provider, status: "error", error: message };
    }

    try {
      const decodedState = decodeOAuthLinkState(state);
      if (decodedState.provider === provider && decodedState.linkId) {
        await this.markLinkFailed(decodedState.linkId, message);
      }
      return this.callbackPageFromState(provider, state, "error", message);
    } catch {
      return { provider, status: "error", error: message };
    }
  }

  private async markLinkFailed(
    linkId: string | undefined,
    message: string,
  ): Promise<void> {
    if (!linkId) {
      return;
    }

    const link = await this.pendingLinkStore.get(linkId);
    if (!link) {
      return;
    }

    await this.pendingLinkStore.update({
      ...link,
      status: "failed",
      error: message,
    });
  }

  private findConnector(provider: string): ConnectorRecord | undefined {
    const registry = this.configService.getRegistry();
    const bySlug = registry.find(provider);
    if (bySlug) {
      return bySlug;
    }
    return registry
      .get()
      .find((connector) => connector.oauth?.providerKey === provider);
  }

  private knownProviderNames(): string[] {
    const names = new Set<string>();
    for (const connector of this.configService.getRegistry().get()) {
      if (connector.authMode === "user_oauth") {
        names.add(connector.oauth?.providerKey ?? connector.slug);
      }
    }
    return [...names];
  }

  private async ensureClient(
    provider: string,
    connector: ConnectorRecord,
    server: ResolvedOAuthServer,
    redirectUri: string,
  ): Promise<ReturnType<typeof clientInformationFrom>> {
    if (connector.oauth?.clientId && connector.oauth.clientSecret) {
      return clientInformationFrom(
        connector.oauth.clientId,
        connector.oauth.clientSecret,
      );
    }

    const fromIssuer = await this.loadIssuerClient(server.issuer, redirectUri);
    if (fromIssuer) {
      return fromIssuer;
    }

    const existing = await this.clientRepository.get(provider);
    if (existing && existing.redirectUri === redirectUri) {
      return clientInformationFrom(existing.clientId, existing.clientSecret);
    }

    if (!server.metadata.registration_endpoint) {
      throw new Error(
        `OAuth provider "${provider}" needs client credentials. Paste a client ID and secret, or use a server that supports dynamic client registration.`,
      );
    }

    const registered = await registerSdkClient({
      authorizationServerUrl: server.authorizationServerUrl,
      metadata: server.metadata,
      redirectUri,
      clientName: `Torii (${provider})`,
      scope: connector.oauth?.scopes?.join(" "),
    });
    await this.persistRegisteredClient(
      provider,
      server.issuer,
      registered,
      redirectUri,
      connector.oauth?.scopes ?? [],
    );
    return clientInformationFrom(registered.clientId, registered.clientSecret);
  }

  private async loadIssuerClient(
    issuer: string,
    redirectUri: string,
  ): Promise<ReturnType<typeof clientInformationFrom> | undefined> {
    if (!this.registrations) {
      return undefined;
    }
    const row = await this.registrations.get(issuer);
    if (!row) {
      return undefined;
    }
    if (row.redirectUri && row.redirectUri !== redirectUri) {
      return undefined;
    }
    let clientSecret: string | undefined;
    if (row.clientSecretRef && this.secrets) {
      const stored = await this.secrets.get(row.clientSecretRef);
      if (stored) {
        clientSecret = await resolveSecretPayload(stored);
      }
    }
    return clientInformationFrom(row.clientId, clientSecret);
  }

  private async persistRegisteredClient(
    provider: string,
    issuer: string,
    registered: { clientId: string; clientSecret?: string },
    redirectUri: string,
    scopes: string[],
  ): Promise<void> {
    await this.clientRepository.set(provider, {
      clientId: registered.clientId,
      ...(registered.clientSecret
        ? { clientSecret: registered.clientSecret }
        : {}),
      redirectUri,
    });
    if (!this.registrations) {
      return;
    }
    let clientSecretRef: string | undefined;
    if (registered.clientSecret && this.secrets) {
      const existing = await this.registrations.get(issuer);
      const secret = await createSealedSecret(registered.clientSecret);
      await this.secrets.insert(secret);
      clientSecretRef = secret.id;
      if (existing?.clientSecretRef) {
        await this.secrets.delete(existing.clientSecretRef);
      }
    }
    await this.registrations.upsert({
      issuer,
      clientId: registered.clientId,
      clientSecretRef,
      redirectUri,
      origin: "dcr",
      scopes,
    });
  }
}

function appendAuthorizeParams(
  authorizationUrl: string,
  params?: Record<string, string>,
): string {
  if (!params || Object.keys(params).length === 0) {
    return authorizationUrl;
  }
  const url = new URL(authorizationUrl);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}
