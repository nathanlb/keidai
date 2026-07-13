import type { OAuthConnectionsResponse } from "@keidai/shared";
import { inject, injectable } from "tsyringe";
import { ToriiConfigService } from "../config/torii-config.service.js";
import {
  PENDING_OAUTH_LINK_STORE,
  type PendingOAuthLinkStore,
} from "./types/pending-oauth-link-store.js";
import {
  TOKEN_REPOSITORY,
  type TokenRepository,
} from "./types/token-repository.js";
import { projectOAuthConnectionStatus } from "./utils/project-oauth-connections.js";
import { resolveOAuthOwnerId } from "./utils/resolve-oauth-owner.js";

/** Read-only projections of OAuth link state for UI consumption. */
@injectable()
export class OAuthConnectionReadService {
  constructor(
    @inject(ToriiConfigService)
    private readonly configService: ToriiConfigService,
    @inject(TOKEN_REPOSITORY)
    private readonly tokenRepository: TokenRepository,
    @inject(PENDING_OAUTH_LINK_STORE)
    private readonly pendingLinkStore: PendingOAuthLinkStore,
  ) {}

  async listConnections(ownerId?: string): Promise<OAuthConnectionsResponse> {
    const config = this.configService.get();
    const resolvedOwnerId = resolveOAuthOwnerId(config, ownerId);
    const grants = await this.tokenRepository.listByOwner(resolvedOwnerId);
    const grantsByProvider = new Map(
      grants.map((grant) => [grant.provider, grant.token]),
    );

    const connections = await Promise.all(
      Object.entries(config.oauth_providers).map(async ([provider, providerConfig]) => {
        const latestLink = await this.pendingLinkStore.getLatest(
          resolvedOwnerId,
          provider,
        );
        const activeLink =
          latestLink?.status === "completed" ? null : latestLink;

        return projectOAuthConnectionStatus(
          resolvedOwnerId,
          provider,
          providerConfig.scopes,
          grantsByProvider.get(provider) ?? null,
          activeLink,
        );
      }),
    );

    return { connections };
  }
}
