import { parseAllowlistCsv } from "./allowlist.js";
import type { OperatorAuthConfig } from "./types.js";

export class OperatorAuthConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OperatorAuthConfigError";
  }
}

function requireEnv(name: string, value: string | undefined): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new OperatorAuthConfigError(`Missing required environment variable: ${name}`);
  }
  return trimmed;
}

/**
 * Resolves operator Google OIDC config from process env.
 *
 * Required:
 * - KEIDAI_GOOGLE_CLIENT_ID
 * - KEIDAI_GOOGLE_CLIENT_SECRET
 * - KEIDAI_GOOGLE_REDIRECT_URI
 * - KEIDAI_SESSION_SECRET (≥32 characters)
 * - KEIDAI_OWNER_ID
 * - KEIDAI_OPERATOR_GOOGLE_SUBS and/or KEIDAI_OPERATOR_GOOGLE_EMAILS
 */
export function resolveOperatorAuthConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): OperatorAuthConfig {
  const googleClientId = requireEnv(
    "KEIDAI_GOOGLE_CLIENT_ID",
    env.KEIDAI_GOOGLE_CLIENT_ID,
  );
  const googleClientSecret = requireEnv(
    "KEIDAI_GOOGLE_CLIENT_SECRET",
    env.KEIDAI_GOOGLE_CLIENT_SECRET,
  );
  const redirectUri = requireEnv(
    "KEIDAI_GOOGLE_REDIRECT_URI",
    env.KEIDAI_GOOGLE_REDIRECT_URI,
  );
  const sessionSecret = requireEnv(
    "KEIDAI_SESSION_SECRET",
    env.KEIDAI_SESSION_SECRET,
  );
  if (sessionSecret.length < 32) {
    throw new OperatorAuthConfigError(
      "KEIDAI_SESSION_SECRET must be at least 32 characters",
    );
  }
  const ownerId = requireEnv("KEIDAI_OWNER_ID", env.KEIDAI_OWNER_ID);

  const googleSubs = parseAllowlistCsv(env.KEIDAI_OPERATOR_GOOGLE_SUBS);
  const emails = parseAllowlistCsv(env.KEIDAI_OPERATOR_GOOGLE_EMAILS).map((e) =>
    e.toLowerCase(),
  );

  if (googleSubs.length === 0 && emails.length === 0) {
    throw new OperatorAuthConfigError(
      "Set KEIDAI_OPERATOR_GOOGLE_SUBS and/or KEIDAI_OPERATOR_GOOGLE_EMAILS",
    );
  }

  const cookieSecure =
    env.KEIDAI_COOKIE_SECURE === "true" ||
    (env.KEIDAI_COOKIE_SECURE !== "false" && env.NODE_ENV === "production");

  return {
    googleClientId,
    googleClientSecret,
    redirectUri,
    sessionSecret,
    ownerId,
    allowlist: {
      googleSubs: new Set(googleSubs),
      emails: new Set(emails),
    },
    cookieSecure,
  };
}
