import type { DependencyContainer } from "tsyringe";
import { ToriiConfigService } from "../config/torii-config.service.js";
import { exchangeAuthorizationCode } from "../credentials/utils/oauth-code-exchange.js";
import { buildOAuthLinkUrl } from "../credentials/utils/oauth-link-url.js";
import { decodeOAuthLinkState } from "../credentials/utils/oauth-link-state.js";
import { createPkceChallenge } from "../credentials/utils/pkce.js";
import {
  TOKEN_REPOSITORY,
  type TokenRepository,
} from "../credentials/types/token-repository.js";
import {
  OAUTH_CLIENT_REPOSITORY,
  type OAuthClientRepository,
} from "../credentials/types/oauth-client-repository.js";
import { ensureRegisteredOAuthClient } from "../credentials/utils/resolve-oauth-provider-config.js";
import { resolveOAuthOwnerId } from "../credentials/utils/resolve-oauth-owner.js";
import { startLoopbackCallbackServer } from "./utils/loopback-callback-server.js";
import { openBrowser } from "./utils/open-browser.js";

const DEFAULT_REDIRECT_URI = "http://127.0.0.1:8765/callback";

export interface LinkCommandOptions {
  provider: string;
  ownerId?: string;
}

function parseLinkArgs(argv: string[]): LinkCommandOptions {
  const provider = argv[0]?.trim();
  if (!provider) {
    throw new Error("Usage: torii link <provider> [--owner <owner_id>]");
  }

  let ownerId: string | undefined;
  for (let index = 1; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--owner") {
      ownerId = argv[index + 1]?.trim();
      if (!ownerId) {
        throw new Error("--owner requires a value");
      }
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return { provider, ownerId };
}

export async function runLinkCommand(
  app: DependencyContainer,
  argv: string[],
): Promise<void> {
  const options = parseLinkArgs(argv);
  const configService = app.resolve(ToriiConfigService);
  const tokenRepository = app.resolve<TokenRepository>(TOKEN_REPOSITORY);
  const clientRepository = app.resolve<OAuthClientRepository>(
    OAUTH_CLIENT_REPOSITORY,
  );
  const config = configService.get();

  const providerConfig = config.oauth_providers[options.provider];
  if (!providerConfig) {
    throw new Error(
      `Unknown OAuth provider "${options.provider}". Defined providers: ${Object.keys(config.oauth_providers).join(", ") || "(none)"}`,
    );
  }

  const ownerId = resolveOAuthOwnerId(config, options.ownerId);
  const redirectUri = providerConfig.redirect_uri ?? DEFAULT_REDIRECT_URI;
  const effectiveProviderConfig = await ensureRegisteredOAuthClient(
    options.provider,
    providerConfig,
    redirectUri,
    clientRepository,
  );
  const usePkce = effectiveProviderConfig.pkce !== false;
  const { codeVerifier, codeChallenge } = usePkce
    ? createPkceChallenge()
    : { codeVerifier: undefined, codeChallenge: undefined };
  const expectedState = Buffer.from(
    JSON.stringify({ ownerId, provider: options.provider }),
  ).toString("base64url");
  const linkUrl = buildOAuthLinkUrl(
    { ...effectiveProviderConfig, redirect_uri: redirectUri },
    options.provider,
    ownerId,
    codeChallenge ? { codeChallenge } : {},
  );

  const callbackServer = await startLoopbackCallbackServer(redirectUri);

  console.log(`Opening browser to link ${options.provider} for owner ${ownerId}...`);
  console.log(`If the browser does not open, visit:\n${linkUrl}`);

  try {
    await openBrowser(linkUrl);
  } catch {
    console.warn("Could not open a browser automatically.");
  }

  try {
    const callback = await callbackServer.waitForCallback();
    const decodedState = decodeOAuthLinkState(callback.state);
    if (callback.state !== expectedState) {
      throw new Error("OAuth callback state does not match the expected value");
    }
    if (decodedState.provider !== options.provider) {
      throw new Error(
        `OAuth callback provider "${decodedState.provider}" does not match "${options.provider}"`,
      );
    }
    if (decodedState.ownerId !== ownerId) {
      throw new Error(
        `OAuth callback owner "${decodedState.ownerId}" does not match "${ownerId}"`,
      );
    }

    const token = await exchangeAuthorizationCode(
      effectiveProviderConfig,
      callback.code,
      redirectUri,
      codeVerifier,
    );

    await tokenRepository.set(ownerId, options.provider, token);

    if (!token.refreshToken) {
      console.warn(
        `Warning: provider "${options.provider}" did not return a refresh_token. Re-link when the access token expires.`,
      );
    }

    console.log(`Linked ${options.provider} for owner ${ownerId}.`);
  } finally {
    await callbackServer.close();
  }
}

export function isLinkCommand(argv: string[]): boolean {
  return argv[0] === "link";
}
