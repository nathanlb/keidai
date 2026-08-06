import assert from "node:assert/strict";
import { createServer } from "node:http";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { after, before, describe, it } from "node:test";
import { verifyGoogleIdToken } from "../google-oidc.js";
import type { OperatorAuthConfig } from "../types.js";

type PrivateKey = Awaited<ReturnType<typeof generateKeyPair>>["privateKey"];

describe("verifyGoogleIdToken", () => {
  let jwksServer: ReturnType<typeof createServer>;
  let jwksUri = "";
  let privateKey: PrivateKey;
  let config: OperatorAuthConfig;

  before(async () => {
    const { privateKey: key, publicKey } = await generateKeyPair("RS256");
    privateKey = key;
    const publicJwk = await exportJWK(publicKey);
    publicJwk.alg = "RS256";
    publicJwk.kid = "test-key";
    publicJwk.use = "sig";

    jwksServer = createServer((_req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ keys: [publicJwk] }));
    });
    await new Promise<void>((resolve) => {
      jwksServer.listen(0, "127.0.0.1", () => resolve());
    });
    const address = jwksServer.address();
    assert(address && typeof address === "object");
    jwksUri = `http://127.0.0.1:${address.port}`;

    config = {
      googleClientId: "test-client-id",
      googleClientSecret: "test-client-secret",
      redirectUri: "http://127.0.0.1/auth/callback",
      sessionSecret: "test-session-secret-at-least-32-chars!!",
      ownerId: "nathanlb",
      allowlist: { googleSubs: new Set(["sub-1"]), emails: new Set() },
      cookieSecure: false,
      googleJwksUri: jwksUri,
      googleIssuer: "https://accounts.google.com",
    };
  });

  after(async () => {
    await new Promise<void>((resolve, reject) => {
      jwksServer.close((error) => (error ? reject(error) : resolve()));
    });
  });

  async function signIdToken(claims: {
    email_verified?: boolean;
    email?: string;
    sub?: string;
  }): Promise<string> {
    return new SignJWT({
      email: claims.email ?? "ops@example.com",
      ...(claims.email_verified !== undefined
        ? { email_verified: claims.email_verified }
        : {}),
    })
      .setProtectedHeader({ alg: "RS256", kid: "test-key" })
      .setSubject(claims.sub ?? "sub-1")
      .setIssuer("https://accounts.google.com")
      .setAudience("test-client-id")
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(privateKey);
  }

  it("accepts a token with email_verified true", async () => {
    const token = await signIdToken({ email_verified: true });
    const claims = await verifyGoogleIdToken(config, token);
    assert.deepEqual(claims, {
      googleSub: "sub-1",
      email: "ops@example.com",
    });
  });

  it("rejects a token with email_verified false", async () => {
    const token = await signIdToken({ email_verified: false });
    await assert.rejects(
      () => verifyGoogleIdToken(config, token),
      /not verified/,
    );
  });

  it("rejects a token missing email_verified", async () => {
    const token = await signIdToken({});
    await assert.rejects(
      () => verifyGoogleIdToken(config, token),
      /not verified/,
    );
  });
});
