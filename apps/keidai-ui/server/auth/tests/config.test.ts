import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  OperatorAuthConfigError,
  resolveOperatorAuthConfigFromEnv,
} from "../config.js";

describe("resolveOperatorAuthConfigFromEnv", () => {
  it("requires Google OIDC env and an allowlist", () => {
    assert.throws(
      () => resolveOperatorAuthConfigFromEnv({}),
      (error: unknown) =>
        error instanceof OperatorAuthConfigError &&
        /KEIDAI_GOOGLE_CLIENT_ID/.test(error.message),
    );
  });

  it("builds config from a complete env", () => {
    const config = resolveOperatorAuthConfigFromEnv({
      KEIDAI_GOOGLE_CLIENT_ID: "cid",
      KEIDAI_GOOGLE_CLIENT_SECRET: "csecret",
      KEIDAI_GOOGLE_REDIRECT_URI: "http://127.0.0.1:3000/auth/callback",
      KEIDAI_SESSION_SECRET: "x".repeat(32),
      KEIDAI_OWNER_ID: "nathanlb",
      KEIDAI_OPERATOR_GOOGLE_EMAILS: "Ops@Example.com, other@example.com",
      KEIDAI_COOKIE_SECURE: "false",
      NODE_ENV: "production",
    });

    assert.equal(config.googleClientId, "cid");
    assert.equal(config.ownerId, "nathanlb");
    assert.equal(config.cookieSecure, false);
    assert.ok(config.allowlist.emails.has("ops@example.com"));
    assert.ok(config.allowlist.emails.has("other@example.com"));
  });
});
