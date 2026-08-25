import type { FastifyInstance, FastifyReply } from "fastify";
import type { OperatorPrincipal } from "@keidai/shared";
import { isOperatorAllowed, resolveOperatorOwnerId } from "./allowlist.js";
import {
  buildGoogleAuthorizationUrl,
  exchangeGoogleAuthorizationCode,
} from "./google-oidc.js";
import { createOAuthState, createPkceChallenge } from "./pkce.js";
import {
  clearOidcStateCookie,
  clearSessionCookie,
  readOidcPendingState,
  readOperatorSession,
  sealOidcPendingState,
  sealOperatorSession,
  serializeOidcStateCookie,
  serializeSessionCookie,
} from "./session.js";
import type { OperatorAuthConfig } from "./types.js";

function appendSetCookie(reply: FastifyReply, value: string): void {
  const existing = reply.getHeader("set-cookie");
  if (!existing) {
    reply.header("set-cookie", value);
    return;
  }
  if (Array.isArray(existing)) {
    reply.header("set-cookie", [...existing, value]);
    return;
  }
  reply.header("set-cookie", [String(existing), value]);
}

function isPublicApiPath(url: string): boolean {
  const pathname = url.split("?")[0] ?? url;
  return pathname === "/api/session";
}

function wantsApi(url: string): boolean {
  const pathname = url.split("?")[0] ?? url;
  return pathname === "/api" || pathname.startsWith("/api/");
}

/**
 * Registers Google OIDC login/logout, `GET /api/session`, and an onRequest
 * gate that rejects unauthenticated `/api/*` calls (except `/api/session`).
 */
export async function registerOperatorAuth(
  app: FastifyInstance,
  config: OperatorAuthConfig,
): Promise<void> {
  // Browser <form method="post"> sends this Content-Type. Fastify only
  // registers JSON by default and would otherwise 415 before logout runs.
  app.addContentTypeParser(
    "application/x-www-form-urlencoded",
    { parseAs: "buffer" },
    (_request, _body, done) => {
      done(null, undefined);
    },
  );

  app.addHook("onRequest", async (request, reply) => {
    if (!wantsApi(request.url) || isPublicApiPath(request.url)) {
      return;
    }

    const principal = await readOperatorSession(request.headers, config);
    if (!principal) {
      return reply.code(401).send({ error: "Unauthorized" });
    }

    request.operatorPrincipal = principal;
  });

  app.get("/api/session", async (request, reply) => {
    const principal = await readOperatorSession(request.headers, config);
    if (!principal) {
      return reply.code(401).send({ error: "Unauthorized" });
    }
    return principal;
  });

  app.get("/auth/login", async (_request, reply) => {
    const { codeVerifier, codeChallenge } = createPkceChallenge();
    const state = createOAuthState();
    const sealed = await sealOidcPendingState(
      { state, codeVerifier },
      config,
    );
    appendSetCookie(reply, serializeOidcStateCookie(sealed, config));
    return reply.redirect(
      buildGoogleAuthorizationUrl(config, { state, codeChallenge }),
    );
  });

  app.get<{
    Querystring: { code?: string; state?: string; error?: string };
  }>("/auth/callback", async (request, reply) => {
    const clearOidc = clearOidcStateCookie(config);

    if (request.query.error) {
      appendSetCookie(reply, clearOidc);
      return reply.redirect(`/?auth_error=${encodeURIComponent(request.query.error)}`);
    }

    const code = request.query.code;
    const state = request.query.state;
    if (!code || !state) {
      appendSetCookie(reply, clearOidc);
      return reply.redirect("/?auth_error=missing_code");
    }

    const pending = await readOidcPendingState(request.headers, config);
    if (!pending || pending.state !== state) {
      appendSetCookie(reply, clearOidc);
      return reply.redirect("/?auth_error=invalid_state");
    }

    let claims: {
      googleSub: string;
      email: string;
      name?: string;
      picture?: string;
    };
    try {
      claims = await exchangeGoogleAuthorizationCode(config, {
        code,
        codeVerifier: pending.codeVerifier,
      });
    } catch {
      appendSetCookie(reply, clearOidc);
      return reply.redirect("/?auth_error=token_exchange");
    }

    if (!isOperatorAllowed(config.operators, claims)) {
      appendSetCookie(reply, clearOidc);
      return reply.code(403).type("text/html").send(forbiddenPage(claims.email));
    }

    const ownerId = resolveOperatorOwnerId(config.operators, claims);
    if (!ownerId) {
      appendSetCookie(reply, clearOidc);
      return reply.code(403).type("text/html").send(forbiddenPage(claims.email));
    }

    const principal: OperatorPrincipal = {
      googleSub: claims.googleSub,
      email: claims.email,
      ownerId,
      ...(claims.name ? { name: claims.name } : {}),
      ...(claims.picture ? { picture: claims.picture } : {}),
    };
    const sealedSession = await sealOperatorSession(principal, config);
    appendSetCookie(reply, clearOidc);
    appendSetCookie(reply, serializeSessionCookie(sealedSession, config));
    return reply.redirect("/");
  });

  // POST-only: SameSite=Lax cookies are sent on cross-site top-level GETs,
  // which would allow logout CSRF via a simple link/img.
  app.post("/auth/logout", async (_request, reply) => {
    appendSetCookie(reply, clearSessionCookie(config));
    appendSetCookie(reply, clearOidcStateCookie(config));
    return reply.redirect("/?signed_out=1");
  });
}

function forbiddenPage(email: string): string {
  const safeEmail = email
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Access denied</title>
  </head>
  <body>
    <h1>Access denied</h1>
    <p>The Google account <strong>${safeEmail}</strong> is not an allowlisted Keidai operator.</p>
    <form method="post" action="/auth/logout">
      <button type="submit">Try another account</button>
    </form>
  </body>
</html>`;
}
