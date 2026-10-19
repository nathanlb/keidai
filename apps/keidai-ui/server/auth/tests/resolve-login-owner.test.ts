import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveLoginOwner } from "../resolve-login-owner.js";
import type { OperatorAuthConfig } from "../types.js";

function config(
  overrides: Partial<OperatorAuthConfig> = {},
): OperatorAuthConfig {
  return {
    googleClientId: "cid",
    googleClientSecret: "secret",
    redirectUri: "http://localhost/auth/callback",
    sessionSecret: "x".repeat(32),
    operators: [],
    cookieSecure: false,
    issuer: "https://accounts.google.com",
    ...overrides,
  };
}

describe("resolveLoginOwner", () => {
  it("rejects a Google account whose hosted domain is outside the allowlist", async () => {
    const result = await resolveLoginOwner(
      config({ allowedEmailDomains: ["acme.com"] }),
      {
        googleSub: "sub",
        email: "ada@acme.com",
        hd: "other.com",
      },
    );
    assert.deepEqual(result, { ok: false, reason: "forbidden" });
  });

  it("provisions a Workspace account whose hd matches", async () => {
    const result = await resolveLoginOwner(
      config({
        allowedEmailDomains: ["acme.com"],
        provisionOwner: async () => ({
          ok: true,
          ownerId: "ada",
          role: "member",
        }),
      }),
      {
        googleSub: "sub",
        email: "ada@acme.com",
        hd: "acme.com",
      },
    );
    assert.deepEqual(result, {
      ok: true,
      ownerId: "ada",
      role: "member",
      email: "ada@acme.com",
    });
  });
});
