import type { RuntimeConfig } from "../config/runtime-config.js";
import {
  hintForSecret,
  resolveShaidenSecretKey,
  sealSecretValue,
  unsealSecretValue,
} from "./seal-secret.js";
import type {
  OpenRouterCredentialRepository,
  OpenRouterCredentialStatus,
  StoredOpenRouterCredential,
} from "./types.js";

export class OpenRouterNotConfiguredError extends Error {
  constructor() {
    super("OpenRouter API key is not configured");
    this.name = "OpenRouterNotConfiguredError";
  }
}

export async function resolveOpenRouterApiKey(input: {
  credentials: OpenRouterCredentialRepository;
  envFallback?: string;
  env?: NodeJS.ProcessEnv;
}): Promise<string> {
  const stored = await input.credentials.get();
  if (stored) {
    return unsealSecretValue(
      stored.sealedPayload,
      resolveShaidenSecretKey(input.env),
    );
  }
  const fallback = input.envFallback?.trim() ?? "";
  if (fallback) {
    return fallback;
  }
  throw new OpenRouterNotConfiguredError();
}

export async function resolveConfiguredOpenRouterApiKey(
  config: Pick<RuntimeConfig, "openRouterApiKey" | "getOpenRouterApiKey">,
): Promise<string> {
  if (config.getOpenRouterApiKey) {
    return config.getOpenRouterApiKey();
  }
  const fallback = config.openRouterApiKey?.trim() ?? "";
  if (!fallback) {
    throw new OpenRouterNotConfiguredError();
  }
  return fallback;
}

export async function describeOpenRouterCredential(input: {
  credentials: OpenRouterCredentialRepository;
  envFallback?: string;
}): Promise<OpenRouterCredentialStatus> {
  const stored = await input.credentials.get();
  if (stored) {
    return { configured: true, hint: stored.hint, source: "stored" };
  }
  const fallback = input.envFallback?.trim() ?? "";
  if (fallback) {
    return {
      configured: true,
      hint: hintForSecret(fallback),
      source: "environment",
    };
  }
  return { configured: false, hint: null, source: "none" };
}

export async function storeOpenRouterApiKey(input: {
  credentials: OpenRouterCredentialRepository;
  apiKey: string;
  env?: NodeJS.ProcessEnv;
  now?: Date;
}): Promise<OpenRouterCredentialStatus> {
  const apiKey = input.apiKey.trim();
  const now = input.now ?? new Date();
  const sealed: StoredOpenRouterCredential = {
    sealedPayload: sealSecretValue(apiKey, resolveShaidenSecretKey(input.env)),
    hint: hintForSecret(apiKey),
    updatedAt: now.toISOString(),
  };
  await input.credentials.put(sealed);
  return { configured: true, hint: sealed.hint, source: "stored" };
}
