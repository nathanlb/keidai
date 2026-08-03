import assert from "node:assert/strict";
import {
  exportJWK,
  generateKeyPair,
  SignJWT,
  createLocalJWKSet,
  jwtVerify,
  type JWK,
  type JSONWebKeySet,
} from "jose";
import { describe, it } from "node:test";
import { createResilientRemoteJWKSet } from "../create-resilient-remote-jwks.js";

const ISSUER = "https://fuda.test";
const AUDIENCE = "torii";

describe("createResilientRemoteJWKSet", () => {
  it("verifies against a fetched JWKS", async () => {
    const { privateKey, publicKey } = await generateKeyPair("RS256");
    const publicJwk = await exportJWK(publicKey);
    publicJwk.alg = "RS256";
    publicJwk.kid = "k1";
    const jwks: JSONWebKeySet = { keys: [publicJwk as JWK] };

    let fetches = 0;
    const verifyKey = createResilientRemoteJWKSet(
      new URL("https://fuda.test/.well-known/jwks.json"),
      {
        cacheMaxAge: 60_000,
        fetchImpl: (async () => {
          fetches += 1;
          return new Response(JSON.stringify(jwks), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }) as typeof fetch,
      },
    );

    const token = await new SignJWT({ agent_id: "a1" })
      .setProtectedHeader({ alg: "RS256", kid: "k1" })
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setExpirationTime("1h")
      .sign(privateKey);

    const { payload } = await jwtVerify(token, verifyKey, {
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    assert.equal(payload.agent_id, "a1");
    assert.equal(fetches, 1);
  });

  it("keeps last-known-good JWKS when refresh fails", async () => {
    const { privateKey, publicKey } = await generateKeyPair("RS256");
    const publicJwk = await exportJWK(publicKey);
    publicJwk.alg = "RS256";
    publicJwk.kid = "k1";
    const jwks: JSONWebKeySet = { keys: [publicJwk as JWK] };

    let fetches = 0;
    const verifyKey = createResilientRemoteJWKSet(
      new URL("https://fuda.test/.well-known/jwks.json"),
      {
        // Force refresh on every verify after the first.
        cacheMaxAge: 0,
        cooldownDuration: 0,
        maxRetries: 0,
        fetchImpl: (async () => {
          fetches += 1;
          if (fetches === 1) {
            return new Response(JSON.stringify(jwks), {
              status: 200,
              headers: { "content-type": "application/json" },
            });
          }
          throw new Error("Fuda unreachable");
        }) as typeof fetch,
      },
    );

    const token = await new SignJWT({ agent_id: "a1" })
      .setProtectedHeader({ alg: "RS256", kid: "k1" })
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setExpirationTime("1h")
      .sign(privateKey);

    // Prime the cache.
    await jwtVerify(token, verifyKey, { issuer: ISSUER, audience: AUDIENCE });
    assert.equal(fetches, 1);

    // Cache expired; refresh fails; last-known-good still verifies.
    const { payload } = await jwtVerify(token, verifyKey, {
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    assert.equal(payload.agent_id, "a1");
    assert.ok(fetches >= 2);

    // Sanity: local set still matches the published key.
    const local = createLocalJWKSet(jwks);
    await jwtVerify(token, local, { issuer: ISSUER, audience: AUDIENCE });
  });

  it("retries JWKS fetch on transient network errors", async () => {
    const { privateKey, publicKey } = await generateKeyPair("RS256");
    const publicJwk = await exportJWK(publicKey);
    publicJwk.alg = "RS256";
    publicJwk.kid = "k1";
    const jwks: JSONWebKeySet = { keys: [publicJwk as JWK] };

    let fetches = 0;
    const verifyKey = createResilientRemoteJWKSet(
      new URL("https://fuda.test/.well-known/jwks.json"),
      {
        maxRetries: 2,
        fetchImpl: (async () => {
          fetches += 1;
          if (fetches < 3) {
            throw new Error("temporary network blip");
          }
          return new Response(JSON.stringify(jwks), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }) as typeof fetch,
      },
    );

    const token = await new SignJWT({ agent_id: "a1" })
      .setProtectedHeader({ alg: "RS256", kid: "k1" })
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setExpirationTime("1h")
      .sign(privateKey);

    await jwtVerify(token, verifyKey, { issuer: ISSUER, audience: AUDIENCE });
    assert.equal(fetches, 3);
  });
});
