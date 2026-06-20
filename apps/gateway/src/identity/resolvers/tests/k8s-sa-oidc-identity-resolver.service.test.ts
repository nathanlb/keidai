import "reflect-metadata";
import assert from "node:assert/strict";
import { generateKeyPair, exportJWK, SignJWT, type JWK } from "jose";
import { describe, it, before } from "node:test";
import type { AgentPrincipal } from "@torii/shared";
import { InMemoryAgentRegistry } from "../../registry/in-memory-agent-registry.service.js";
import { K8sSaOidcIdentityResolver } from "../k8s-sa-oidc-identity-resolver.service.js";
import { IdentityResolutionError } from "../../types/identity-resolution-error.js";
import type { K8sSaOidcConfig } from "../../types/k8s-sa-oidc-config.js";

const ISSUER = "https://kubernetes.default.svc.cluster.local";
const AUDIENCE = "https://kubernetes.default.svc.cluster.local";
const NAMESPACE = "torii-agents";
const SERVICE_ACCOUNT = "catalog-agent";

const EXPECTED_PRINCIPAL: AgentPrincipal = {
  agentId: "agent-catalog-01",
  ownerId: "user-alice",
  groups: ["agents"],
};

const oidcConfig: K8sSaOidcConfig = {
  issuer: ISSUER,
  audience: AUDIENCE,
  jwksUri: "https://kubernetes.default.svc/openid/v1/jwks",
};

type PrivateKey = Awaited<ReturnType<typeof generateKeyPair>>["privateKey"];

interface TestKeys {
  privateKey: PrivateKey;
  publicJwk: JWK;
  otherPrivateKey: PrivateKey;
}

let keys: TestKeys;

async function createTestKeys(): Promise<TestKeys> {
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const { privateKey: otherPrivateKey } = await generateKeyPair("RS256");
  const publicJwk = await exportJWK(publicKey);
  publicJwk.alg = "RS256";
  publicJwk.kid = "test-key";
  return { privateKey, publicJwk, otherPrivateKey };
}

function createResolver(): K8sSaOidcIdentityResolver {
  const registry = new InMemoryAgentRegistry(
    new Map([[`${NAMESPACE}/${SERVICE_ACCOUNT}`, EXPECTED_PRINCIPAL]]),
  );
  const verifyKey = async (header: { kid?: string }) => {
    if (header.kid && header.kid !== keys.publicJwk.kid) {
      throw new Error("Unknown key id");
    }
    return crypto.subtle.importKey(
      "jwk",
      keys.publicJwk,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
  };

  return new K8sSaOidcIdentityResolver(registry, oidcConfig, verifyKey);
}

async function signToken(
  privateKey: PrivateKey,
  claims: {
    sub: string;
    aud?: string | string[];
    exp?: number;
    iss?: string;
  },
): Promise<string> {
  const builder = new SignJWT({})
    .setProtectedHeader({ alg: "RS256", kid: "test-key" })
    .setSubject(claims.sub)
    .setIssuer(claims.iss ?? ISSUER)
    .setAudience(claims.aud ?? AUDIENCE)
    .setIssuedAt();

  if (claims.exp !== undefined) {
    builder.setExpirationTime(claims.exp);
  } else {
    builder.setExpirationTime("1h");
  }

  return builder.sign(privateKey);
}

describe("K8sSaOidcIdentityResolver", () => {
  before(async () => {
    keys = await createTestKeys();
  });

  it("resolves a valid projected SA token to the correct internal principal", async () => {
    const resolver = createResolver();
    const token = await signToken(keys.privateKey, {
      sub: `system:serviceaccount:${NAMESPACE}:${SERVICE_ACCOUNT}`,
    });

    const principal = await resolver.resolve(token);

    assert.deepEqual(principal, EXPECTED_PRINCIPAL);
    assert.equal(typeof principal.agentId, "string");
    assert.ok(!principal.agentId.includes("system:serviceaccount:"));
    assert.ok(!principal.ownerId.includes("system:serviceaccount:"));
  });

  it("rejects a token with an invalid signature", async () => {
    const resolver = createResolver();
    const token = await signToken(keys.otherPrivateKey, {
      sub: `system:serviceaccount:${NAMESPACE}:${SERVICE_ACCOUNT}`,
    });

    await assert.rejects(
      () => resolver.resolve(token),
      (error: unknown) => {
        assert.ok(error instanceof IdentityResolutionError);
        assert.match(error.message, /signature|validation failed/i);
        return true;
      },
    );
  });

  it("rejects a token with the wrong audience", async () => {
    const resolver = createResolver();
    const token = await signToken(keys.privateKey, {
      sub: `system:serviceaccount:${NAMESPACE}:${SERVICE_ACCOUNT}`,
      aud: "https://wrong-audience.example",
    });

    await assert.rejects(
      () => resolver.resolve(token),
      (error: unknown) => {
        assert.ok(error instanceof IdentityResolutionError);
        assert.match(error.message, /aud/i);
        return true;
      },
    );
  });

  it("rejects an expired token", async () => {
    const resolver = createResolver();
    const token = await signToken(keys.privateKey, {
      sub: `system:serviceaccount:${NAMESPACE}:${SERVICE_ACCOUNT}`,
      exp: Math.floor(Date.now() / 1000) - 60,
    });

    await assert.rejects(
      () => resolver.resolve(token),
      (error: unknown) => {
        assert.ok(error instanceof IdentityResolutionError);
        assert.match(error.message, /expired/i);
        return true;
      },
    );
  });

  it("rejects a token whose subject is not a Kubernetes service account", async () => {
    const resolver = createResolver();
    const token = await signToken(keys.privateKey, {
      sub: "spiffe://cluster.local/ns/torii/sa/catalog-agent",
    });

    await assert.rejects(
      () => resolver.resolve(token),
      (error: unknown) => {
        assert.ok(error instanceof IdentityResolutionError);
        assert.match(error.message, /not a Kubernetes service account/i);
        return true;
      },
    );
  });

  it("never exposes system:serviceaccount in returned AgentPrincipal", async () => {
    const resolver = createResolver();
    const token = await signToken(keys.privateKey, {
      sub: `system:serviceaccount:${NAMESPACE}:${SERVICE_ACCOUNT}`,
    });
    const principal = await resolver.resolve(token);
    const serialized = JSON.stringify(principal);
    assert.ok(!serialized.includes("system:serviceaccount:"));
  });
});
