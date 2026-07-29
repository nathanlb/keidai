import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRemoteJWKSet, jwtVerify, decodeProtectedHeader } from "jose";
import { SigningKeyService } from "../../signing/signing-key.service.js";
import { writeTempSigningKeyPem } from "../../signing/tests/test-helpers.js";
import { createTestServer, createTestServerWithKeys } from "./test-helpers.js";

describe("JWKS endpoint", () => {
  it("serves active public keys with kid on the public route group", async () => {
    const oldPath = writeTempSigningKeyPem("old");
    const newPath = writeTempSigningKeyPem("new");
    const { server } = createTestServerWithKeys({
      listenGroups: "public",
      keys: [
        { kid: "old", path: oldPath },
        { kid: "new", path: newPath },
      ],
      signingKid: "old",
    });
    const handle = await server.start({ host: "127.0.0.1", port: 0 });
    try {
      const response = await fetch(`${handle.baseUrl}/.well-known/jwks.json`);
      assert.equal(response.status, 200);
      const body = (await response.json()) as {
        keys: Array<{ kid?: string; kty?: string; alg?: string; use?: string }>;
      };
      assert.equal(body.keys.length, 2);
      const kids = body.keys.map((key) => key.kid).sort();
      assert.deepEqual(kids, ["new", "old"]);
      for (const key of body.keys) {
        assert.equal(key.kty, "RSA");
        assert.equal(key.alg, "RS256");
        assert.equal(key.use, "sig");
      }
    } finally {
      await handle.close();
    }
  });

  it("is reachable without authentication", async () => {
    const server = createTestServer("public");
    const handle = await server.start({ host: "127.0.0.1", port: 0 });
    try {
      const response = await fetch(`${handle.baseUrl}/.well-known/jwks.json`);
      assert.equal(response.status, 200);
    } finally {
      await handle.close();
    }
  });

  it("is absent when only the management group is enabled", async () => {
    const server = createTestServer("management");
    const handle = await server.start({ host: "127.0.0.1", port: 0 });
    try {
      const response = await fetch(`${handle.baseUrl}/.well-known/jwks.json`);
      assert.equal(response.status, 404);
    } finally {
      await handle.close();
    }
  });
});

describe("signing key rotation", () => {
  it("keeps old-key tokens valid while both keys are published", async () => {
    const oldPath = writeTempSigningKeyPem("old");
    const newPath = writeTempSigningKeyPem("new");

    // Publish both keys; still sign with old.
    const published = createTestServerWithKeys({
      listenGroups: "public",
      keys: [
        { kid: "old", path: oldPath },
        { kid: "new", path: newPath },
      ],
      signingKid: "old",
    });
    const publishedHandle = await published.server.start({
      host: "127.0.0.1",
      port: 0,
    });

    try {
      const oldSigner = published.container.resolve(SigningKeyService);
      assert.equal(oldSigner.getSigningKid(), "old");
      const tokenFromOld = await oldSigner.signJwt({
        issuer: "https://fuda.test",
        audience: "torii",
        expiresInSeconds: 300,
        claims: { agent_id: "agent-1" },
      });
      assert.equal(decodeProtectedHeader(tokenFromOld).kid, "old");

      const jwks = createRemoteJWKSet(
        new URL(`${publishedHandle.baseUrl}/.well-known/jwks.json`),
      );
      const verifiedOld = await jwtVerify(tokenFromOld, jwks, {
        issuer: "https://fuda.test",
        audience: "torii",
      });
      assert.equal(verifiedOld.payload.agent_id, "agent-1");

      // Switch signing to new key (both still published).
      const switched = createTestServerWithKeys({
        listenGroups: "public",
        keys: [
          { kid: "old", path: oldPath },
          { kid: "new", path: newPath },
        ],
        signingKid: "new",
      });
      const switchedHandle = await switched.server.start({
        host: "127.0.0.1",
        port: 0,
      });
      try {
        const newSigner = switched.container.resolve(SigningKeyService);
        const tokenFromNew = await newSigner.signJwt({
          issuer: "https://fuda.test",
          audience: "torii",
          expiresInSeconds: 300,
          claims: { agent_id: "agent-2" },
        });
        assert.equal(decodeProtectedHeader(tokenFromNew).kid, "new");

        const switchedJwks = createRemoteJWKSet(
          new URL(`${switchedHandle.baseUrl}/.well-known/jwks.json`),
        );

        // In-flight old token still validates against the dual JWKS.
        await jwtVerify(tokenFromOld, switchedJwks, {
          issuer: "https://fuda.test",
          audience: "torii",
        });
        await jwtVerify(tokenFromNew, switchedJwks, {
          issuer: "https://fuda.test",
          audience: "torii",
        });
      } finally {
        await switchedHandle.close();
      }

      // Retire old key: only new remains.
      const retired = createTestServerWithKeys({
        listenGroups: "public",
        keys: [{ kid: "new", path: newPath }],
        signingKid: "new",
      });
      const retiredHandle = await retired.server.start({
        host: "127.0.0.1",
        port: 0,
      });
      try {
        const retiredJwksResponse = await fetch(
          `${retiredHandle.baseUrl}/.well-known/jwks.json`,
        );
        const retiredJwksBody = (await retiredJwksResponse.json()) as {
          keys: Array<{ kid?: string }>;
        };
        assert.deepEqual(
          retiredJwksBody.keys.map((key) => key.kid),
          ["new"],
        );

        const retiredJwks = createRemoteJWKSet(
          new URL(`${retiredHandle.baseUrl}/.well-known/jwks.json`),
        );
        await assert.rejects(
          () =>
            jwtVerify(tokenFromOld, retiredJwks, {
              issuer: "https://fuda.test",
              audience: "torii",
            }),
          /JWKSNoMatchingKey|no applicable key/i,
        );
      } finally {
        await retiredHandle.close();
      }
    } finally {
      await publishedHandle.close();
    }
  });
});
