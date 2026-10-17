import { readFile } from "node:fs/promises";
import { parse as parseYaml } from "yaml";
import {
  OperatorsValidationError,
  parseOperatorsDocument,
  type OperatorEntry,
  type OperatorsFile,
} from "@keidai/shared";
import type { OperatorAuthConfig } from "./types.js";
import {
  discoverOidcProvider,
  type OidcProviderMetadata,
} from "./oidc-discovery.js";

export class OperatorAuthConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OperatorAuthConfigError";
  }
}

function requireEnv(name: string, value: string | undefined): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new OperatorAuthConfigError(
      `Missing required environment variable: ${name}`,
    );
  }
  return trimmed;
}

export async function loadOperatorsFile(
  filePath: string,
): Promise<OperatorsFile> {
  let raw: string;
  try {
    raw = await readFile(filePath, "utf8");
  } catch (error) {
    throw new OperatorAuthConfigError(
      `Failed to read operators file at ${filePath}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  let document: unknown;
  try {
    document = parseYaml(raw);
  } catch (error) {
    throw new OperatorAuthConfigError(
      `Failed to parse operators YAML at ${filePath}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  try {
    return parseOperatorsDocument(document);
  } catch (error) {
    if (error instanceof OperatorsValidationError) {
      throw new OperatorAuthConfigError(
        `Invalid operators file ${filePath}: ${error.message}`,
      );
    }
    throw error;
  }
}

const GOOGLE_ISSUER = "https://accounts.google.com";

function firstEnv(
  pairs: ReadonlyArray<readonly [string, string | undefined]>,
): { name: string; value: string } {
  for (const [name, value] of pairs) {
    const trimmed = value?.trim();
    if (trimmed) {
      return { name, value: trimmed };
    }
  }
  const names = pairs.map(([name]) => name).join(" or ");
  throw new OperatorAuthConfigError(
    `Missing required environment variable: ${names}`,
  );
}

function parseEmailDomains(raw: string | undefined): string[] {
  if (!raw?.trim()) {
    return [];
  }
  return raw
    .split(",")
    .map((domain) => domain.trim().toLowerCase())
    .filter((domain) => domain.length > 0);
}

/**
 * Resolves operator OIDC config from process env.
 *
 * Client credentials accept `OIDC_*` or the existing `KEIDAI_GOOGLE_*` names.
 * `OIDC_ISSUER_URL` discovers endpoints. Without it, Google's defaults are used.
 * `KEIDAI_OPERATORS_PATH` is optional; when omitted, login provisions any
 * account the IdP accepts (subject to `OIDC_ALLOWED_EMAIL_DOMAINS`).
 */
export async function resolveOperatorAuthConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
  discover: (
    issuerUrl: string,
  ) => Promise<OidcProviderMetadata> = discoverOidcProvider,
): Promise<OperatorAuthConfig> {
  const clientId = firstEnv([
    ["OIDC_CLIENT_ID", env.OIDC_CLIENT_ID],
    ["KEIDAI_GOOGLE_CLIENT_ID", env.KEIDAI_GOOGLE_CLIENT_ID],
  ]);
  const clientSecret = firstEnv([
    ["OIDC_CLIENT_SECRET", env.OIDC_CLIENT_SECRET],
    ["KEIDAI_GOOGLE_CLIENT_SECRET", env.KEIDAI_GOOGLE_CLIENT_SECRET],
  ]);
  const redirect = firstEnv([
    ["OIDC_REDIRECT_URI", env.OIDC_REDIRECT_URI],
    ["KEIDAI_GOOGLE_REDIRECT_URI", env.KEIDAI_GOOGLE_REDIRECT_URI],
  ]);
  const sessionSecret = requireEnv(
    "KEIDAI_SESSION_SECRET",
    env.KEIDAI_SESSION_SECRET,
  );
  if (sessionSecret.length < 32) {
    throw new OperatorAuthConfigError(
      "KEIDAI_SESSION_SECRET must be at least 32 characters",
    );
  }

  const operatorsPath = env.KEIDAI_OPERATORS_PATH?.trim();
  const operators: readonly OperatorEntry[] = operatorsPath
    ? (await loadOperatorsFile(operatorsPath)).operators
    : [];

  const configuredIssuer = env.OIDC_ISSUER_URL?.trim();
  let metadata: OidcProviderMetadata | null = null;
  if (configuredIssuer) {
    try {
      metadata = await discover(configuredIssuer);
    } catch (error) {
      throw new OperatorAuthConfigError(
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  const issuer = metadata?.issuer ?? configuredIssuer ?? GOOGLE_ISSUER;
  const cookieSecure =
    env.KEIDAI_COOKIE_SECURE === "true" ||
    (env.KEIDAI_COOKIE_SECURE !== "false" && env.NODE_ENV === "production");
  const allowedEmailDomains = parseEmailDomains(
    env.OIDC_ALLOWED_EMAIL_DOMAINS,
  );

  return {
    googleClientId: clientId.value,
    googleClientSecret: clientSecret.value,
    redirectUri: redirect.value,
    sessionSecret,
    operators,
    cookieSecure,
    issuer,
    googleIssuer: issuer,
    googleAuthorizationEndpoint: metadata?.authorizationEndpoint,
    googleTokenEndpoint: metadata?.tokenEndpoint,
    googleJwksUri: metadata?.jwksUri,
    ...(allowedEmailDomains.length > 0 ? { allowedEmailDomains } : {}),
  };
}
