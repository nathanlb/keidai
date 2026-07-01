import type { OAuthProviderConfig } from "@keidai/shared";
import type { OAuthClientRepository } from "../types/oauth-client-repository.js";
import { registerDynamicOAuthClient } from "./oauth-dynamic-client-registration.js";

function requireStaticClientCredentials(
  providerName: string,
  providerConfig: OAuthProviderConfig,
): OAuthProviderConfig {
  if (!providerConfig.client_id) {
    throw new Error(
      `OAuth provider "${providerName}" is missing client_id in oauth_providers`,
    );
  }

  return {
    ...providerConfig,
    client_secret: providerConfig.client_secret ?? "",
  };
}

export async function resolveOAuthProviderConfig(
  providerName: string,
  providerConfig: OAuthProviderConfig,
  clientRepository: OAuthClientRepository,
): Promise<OAuthProviderConfig> {
  if (!providerConfig.registration_endpoint) {
    return requireStaticClientCredentials(providerName, providerConfig);
  }

  const registered = await clientRepository.get(providerName);
  if (!registered) {
    throw new Error(
      `OAuth provider "${providerName}" has no registered client. Link this provider from the Torii UI (OAuth providers screen) before use.`,
    );
  }

  return {
    ...providerConfig,
    client_id: registered.clientId,
    ...(registered.clientSecret ? { client_secret: registered.clientSecret } : {}),
  };
}

export async function ensureRegisteredOAuthClient(
  providerName: string,
  providerConfig: OAuthProviderConfig,
  redirectUri: string,
  clientRepository: OAuthClientRepository,
): Promise<OAuthProviderConfig> {
  if (!providerConfig.registration_endpoint) {
    return requireStaticClientCredentials(providerName, providerConfig);
  }

  const existing = await clientRepository.get(providerName);
  if (existing && existing.redirectUri === redirectUri) {
    return resolveOAuthProviderConfig(providerName, providerConfig, clientRepository);
  }

  const registered = await registerDynamicOAuthClient(
    providerConfig.registration_endpoint,
    redirectUri,
    `Torii (${providerName})`,
  );
  await clientRepository.set(providerName, {
    ...registered,
    redirectUri,
  });

  return {
    ...providerConfig,
    client_id: registered.clientId,
    ...(registered.clientSecret ? { client_secret: registered.clientSecret } : {}),
  };
}
