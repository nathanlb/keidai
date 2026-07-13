import { randomUUID } from "node:crypto";
import type { OAuthInitiateResponse } from "@keidai/shared";
import { inject, injectable } from "tsyringe";
import { ToriiConfigService } from "../config/torii-config.service.js";
import { StructuredLoggerService } from "../logging/structured-logger.service.js";
import type { Logger } from "@keidai/shared";
import {
  OAUTH_CLIENT_REPOSITORY,
  type OAuthClientRepository,
} from "./types/oauth-client-repository.js";
import type { PendingOAuthLink } from "./types/pending-oauth-link.js";
import {
  PENDING_OAUTH_LINK_STORE,
  type PendingOAuthLinkStore,
} from "./types/pending-oauth-link-store.js";
import {
  TOKEN_REPOSITORY,
  type TokenRepository,
} from "./types/token-repository.js";
import { exchangeAuthorizationCode } from "./utils/oauth-code-exchange.js";
import { buildOAuthLinkUrl } from "./utils/oauth-link-url.js";
import { decodeOAuthLinkState, type OAuthLinkState } from "./utils/oauth-link-state.js";
import { createPkceChallenge } from "./utils/pkce.js";
import { buildOAuthCallbackRedirectUri } from "./utils/oauth-callback-redirect-uri.js";
import { ensureRegisteredOAuthClient } from "./utils/resolve-oauth-provider-config.js";
import { resolveOAuthOwnerId } from "./utils/resolve-oauth-owner.js";

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
  ) {}

  async initiate(
    provider: string,
    baseUrl: string,
    ownerId?: string,
    uiOrigin?: string,
  ): Promise<OAuthInitiateResponse> {
    const config = this.configService.get();
    const providerConfig = config.oauth_providers[provider];
    if (!providerConfig) {
      throw new Error(
        `Unknown OAuth provider "${provider}". Defined providers: ${Object.keys(config.oauth_providers).join(", ") || "(none)"}`,
      );
    }

    const resolvedOwnerId = resolveOAuthOwnerId(config, ownerId);
    const redirectUri = buildOAuthCallbackRedirectUri(baseUrl, provider);
    const effectiveProviderConfig = await ensureRegisteredOAuthClient(
      provider,
      providerConfig,
      redirectUri,
      this.clientRepository,
    );
    const usePkce = effectiveProviderConfig.pkce !== false;
    const { codeVerifier, codeChallenge } = usePkce
      ? createPkceChallenge()
      : { codeVerifier: undefined, codeChallenge: undefined };
    const linkId = randomUUID();

    await this.pendingLinkStore.create({
      linkId,
      ownerId: resolvedOwnerId,
      provider,
      codeVerifier,
      redirectUri,
      ...(uiOrigin ? { uiOrigin } : {}),
      status: "pending",
      createdAt: new Date(),
    });

    const authorizationUrl = buildOAuthLinkUrl(
      effectiveProviderConfig,
      provider,
      resolvedOwnerId,
      {
        redirectUri,
        ...(codeChallenge ? { codeChallenge } : {}),
        linkId,
      },
    );

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
    const config = this.configService.get();
    if (!config.oauth_providers[provider]) {
      throw new Error(`Unknown OAuth provider "${provider}"`);
    }

    const resolvedOwnerId = resolveOAuthOwnerId(config, ownerId);
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
    const providerConfig = this.configService.get().oauth_providers[provider];
    if (!providerConfig) {
      return this.callbackFailure(
        `Unknown OAuth provider "${provider}"`,
        pendingLink.linkId,
      );
    }

    try {
      const effectiveProviderConfig = await ensureRegisteredOAuthClient(
        provider,
        providerConfig,
        pendingLink.redirectUri,
        this.clientRepository,
      );
      const token = await exchangeAuthorizationCode(
        effectiveProviderConfig,
        code,
        pendingLink.redirectUri,
        pendingLink.codeVerifier,
      );
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
}
