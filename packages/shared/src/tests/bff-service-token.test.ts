import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  authorizeBffServiceToken,
  bffServiceTokenAuthorizationHeader,
  extractBearerCredential,
  isBffServiceTokenDisabled,
  isBffServiceTokenProtectedPath,
  resolveBffServiceToken,
} from "../bff-service-token.js";

describe("resolveBffServiceToken", () => {
  it("returns null when explicitly disabled", () => {
    assert.equal(
      resolveBffServiceToken({ BFF_SERVICE_TOKEN_DISABLED: "true" }),
      null,
    );
    assert.equal(
      resolveBffServiceToken({
        BFF_SERVICE_TOKEN: "secret",
        BFF_SERVICE_TOKEN_DISABLED: "1",
      }),
      null,
    );
    assert.equal(isBffServiceTokenDisabled({ BFF_SERVICE_TOKEN_DISABLED: "yes" }), true);
  });

  it("throws when the token is missing and not disabled", () => {
    assert.throws(() => resolveBffServiceToken({}), /BFF_SERVICE_TOKEN is required/);
    assert.throws(
      () => resolveBffServiceToken({ BFF_SERVICE_TOKEN: "" }),
      /BFF_SERVICE_TOKEN is required/,
    );
    assert.throws(
      () => resolveBffServiceToken({ BFF_SERVICE_TOKEN: "  " }),
      /BFF_SERVICE_TOKEN is required/,
    );
  });

  it("trims and returns a configured token", () => {
    assert.equal(
      resolveBffServiceToken({ BFF_SERVICE_TOKEN: " secret-token " }),
      "secret-token",
    );
  });
});

describe("isBffServiceTokenProtectedPath", () => {
  it("protects management /api paths and exempts health", () => {
    assert.equal(isBffServiceTokenProtectedPath("/api/health"), false);
    assert.equal(isBffServiceTokenProtectedPath("/api/health?x=1"), false);
    assert.equal(isBffServiceTokenProtectedPath("/api/agents"), true);
    assert.equal(isBffServiceTokenProtectedPath("/api/tasks"), true);
    assert.equal(isBffServiceTokenProtectedPath("/api/config/servers"), true);
    assert.equal(isBffServiceTokenProtectedPath("/mcp"), false);
    assert.equal(isBffServiceTokenProtectedPath("/token"), false);
    assert.equal(isBffServiceTokenProtectedPath("/agents/a1"), false);
    assert.equal(isBffServiceTokenProtectedPath("/.well-known/jwks.json"), false);
    assert.equal(isBffServiceTokenProtectedPath("/oauth/callback/github"), false);
  });
});

describe("extractBearerCredential", () => {
  it("parses Bearer credentials and rejects invalid headers", () => {
    assert.equal(extractBearerCredential("Bearer abc"), "abc");
    assert.equal(extractBearerCredential(["Bearer xyz"]), "xyz");
    assert.equal(extractBearerCredential("Basic abc"), null);
    assert.equal(extractBearerCredential("Bearer "), null);
    assert.equal(extractBearerCredential(undefined), null);
  });
});

describe("authorizeBffServiceToken", () => {
  it("allows all requests when the gate is explicitly disabled", () => {
    assert.deepEqual(
      authorizeBffServiceToken({
        expectedToken: null,
        authorization: undefined,
        pathname: "/api/agents",
      }),
      { ok: true },
    );
  });

  it("allows exempt paths when the token is configured", () => {
    assert.deepEqual(
      authorizeBffServiceToken({
        expectedToken: "secret",
        authorization: undefined,
        pathname: "/api/health",
      }),
      { ok: true },
    );
    assert.deepEqual(
      authorizeBffServiceToken({
        expectedToken: "secret",
        authorization: undefined,
        pathname: "/mcp",
      }),
      { ok: true },
    );
  });

  it("rejects missing or wrong tokens on protected paths", () => {
    assert.deepEqual(
      authorizeBffServiceToken({
        expectedToken: "secret",
        authorization: undefined,
        pathname: "/api/agents",
      }),
      { ok: false, statusCode: 401, error: "Unauthorized" },
    );
    assert.deepEqual(
      authorizeBffServiceToken({
        expectedToken: "secret",
        authorization: "Bearer wrong",
        pathname: "/api/agents",
      }),
      { ok: false, statusCode: 401, error: "Unauthorized" },
    );
    assert.deepEqual(
      authorizeBffServiceToken({
        expectedToken: "secret",
        authorization: "Bearer secre",
        pathname: "/api/agents",
      }),
      { ok: false, statusCode: 401, error: "Unauthorized" },
    );
  });

  it("accepts a matching Bearer token", () => {
    assert.deepEqual(
      authorizeBffServiceToken({
        expectedToken: "secret",
        authorization: bffServiceTokenAuthorizationHeader("secret"),
        pathname: "/api/agents",
      }),
      { ok: true },
    );
  });
});
