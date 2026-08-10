import type { OperatorPrincipal } from "@keidai/shared";
import { isOperatorAllowed } from "./allowlist.js";
import { readCookie, serializeCookie } from "./cookie.js";
import { sealPayload, unsealPayload } from "./sealed-cookie.js";
import {
  DEFAULT_SESSION_MAX_AGE_SECONDS,
  OPERATOR_OIDC_STATE_COOKIE,
  OPERATOR_SESSION_COOKIE,
  type OidcPendingState,
  type OperatorAuthConfig,
} from "./types.js";
import type { IncomingHttpHeaders } from "node:http";

export {
  OPERATOR_OIDC_STATE_COOKIE,
  OPERATOR_SESSION_COOKIE,
} from "./types.js";

function sessionMaxAge(config: OperatorAuthConfig): number {
  return config.sessionMaxAgeSeconds ?? DEFAULT_SESSION_MAX_AGE_SECONDS;
}

export async function sealOperatorSession(
  principal: OperatorPrincipal,
  config: OperatorAuthConfig,
): Promise<string> {
  return sealPayload(
    {
      googleSub: principal.googleSub,
      email: principal.email,
      ownerId: principal.ownerId,
      ...(principal.name ? { name: principal.name } : {}),
      ...(principal.picture ? { picture: principal.picture } : {}),
    },
    config.sessionSecret,
    sessionMaxAge(config),
  );
}

export async function readOperatorSession(
  headers: IncomingHttpHeaders,
  config: OperatorAuthConfig,
): Promise<OperatorPrincipal | null> {
  const raw = readCookie(headers, OPERATOR_SESSION_COOKIE);
  if (!raw) {
    return null;
  }

  const payload = await unsealPayload<{
    googleSub?: unknown;
    email?: unknown;
    ownerId?: unknown;
    name?: unknown;
    picture?: unknown;
  }>(raw, config.sessionSecret);

  if (
    !payload ||
    typeof payload.googleSub !== "string" ||
    typeof payload.email !== "string" ||
    typeof payload.ownerId !== "string"
  ) {
    return null;
  }

  // Re-check operators registry on every unseal so removals take effect
  // on the next /api/session or gated /api/* request (not only at login).
  if (
    !isOperatorAllowed(config.operators, {
      googleSub: payload.googleSub,
      email: payload.email,
    })
  ) {
    return null;
  }

  return {
    googleSub: payload.googleSub,
    email: payload.email,
    ownerId: payload.ownerId,
    ...(typeof payload.name === "string" ? { name: payload.name } : {}),
    ...(typeof payload.picture === "string"
      ? { picture: payload.picture }
      : {}),
  };
}

export function serializeSessionCookie(
  sealed: string,
  config: OperatorAuthConfig,
): string {
  return serializeCookie(OPERATOR_SESSION_COOKIE, sealed, {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: "Lax",
    path: "/",
    maxAgeSeconds: sessionMaxAge(config),
  });
}

export function clearSessionCookie(config: OperatorAuthConfig): string {
  return serializeCookie(OPERATOR_SESSION_COOKIE, "", {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: "Lax",
    path: "/",
    clear: true,
  });
}

export async function sealOidcPendingState(
  state: OidcPendingState,
  config: OperatorAuthConfig,
): Promise<string> {
  // Short-lived: authorization code flow should complete quickly.
  return sealPayload(
    { state: state.state, codeVerifier: state.codeVerifier },
    config.sessionSecret,
    60 * 10,
  );
}

export async function readOidcPendingState(
  headers: IncomingHttpHeaders,
  config: OperatorAuthConfig,
): Promise<OidcPendingState | null> {
  const raw = readCookie(headers, OPERATOR_OIDC_STATE_COOKIE);
  if (!raw) {
    return null;
  }

  const payload = await unsealPayload<{
    state?: unknown;
    codeVerifier?: unknown;
  }>(raw, config.sessionSecret);

  if (
    !payload ||
    typeof payload.state !== "string" ||
    typeof payload.codeVerifier !== "string"
  ) {
    return null;
  }

  return { state: payload.state, codeVerifier: payload.codeVerifier };
}

export function serializeOidcStateCookie(
  sealed: string,
  config: OperatorAuthConfig,
): string {
  return serializeCookie(OPERATOR_OIDC_STATE_COOKIE, sealed, {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: "Lax",
    path: "/",
    maxAgeSeconds: 60 * 10,
  });
}

export function clearOidcStateCookie(config: OperatorAuthConfig): string {
  return serializeCookie(OPERATOR_OIDC_STATE_COOKIE, "", {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: "Lax",
    path: "/",
    clear: true,
  });
}
