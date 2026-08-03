import "reflect-metadata";
import assert from "node:assert/strict";
import { generateKeyPair, exportJWK, SignJWT, type JWK } from "jose";
import { describe, it, before } from "node:test";
import type { AgentPrincipal } from "@keidai/shared";
import {
  FudaJwtIdentityResolver,
  FUDA_JWT_AUDIENCE,
} from "../fuda-jwt-identity-resolver.service.js";
import { IdentityResolutionError } from "../../types/identity-resolution-error.js";
import type { FudaJwtConfig } from "../../types/fuda-jwt-config.js";

const ISSUER = "https://fuda.test";

const EXPECTED_PRINCIPAL: AgentPrincipal = {
  agentId: "agent-catalog-01",
  ownerId: "user-alice",
  groups: ["agents"],
  bearerId: "shaiden-runner-1",
};

const jwtConfig: FudaJwtConfig = {
  issuer: ISSUER,
  jwksUri: "https://fuda.test/.well-known/jwks.json",
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

function createResolver(): FudaJwtIdentityResolver {
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

  return new FudaJwtIdentityResolver(jwtConfig, verifyKey);
}

async function signToken(
  privateKey: PrivateKey,
  claims: {
    agent_id?: string;
    owner_id?: string;
    groups?: string[];
    bearer_id?: string;
    aud?: string | string[];
    exp?: number;
    iss?: string;
    omit?: Array<"agent_id" | "owner_id" | "groups" | "bearer_id">;
  } = {},
): Promise<string> {
  const omit = new Set(claims.omit ?? []);
  const payload: Record<string, unknown> = {};
  if (!omit.has("agent_id")) {
    payload.agent_id = claims.agent_id ?? EXPECTED_PRINCIPAL.agentId;
  }
  if (!omit.has("owner_id")) {
    payload.owner_id = claims.owner_id ?? EXPECTED_PRINCIPAL.ownerId;
  }
  if (!omit.has("groups")) {
    payload.groups = claims.groups ?? EXPECTED_PRINCIPAL.groups;
  }
  if (!omit.has("bearer_id")) {
    payload.bearer_id = claims.bearer_id ?? EXPECTED_PRINCIPAL.bearerId;
  }

  const builder = new SignJWT(payload)
    .setProtectedHeader({ alg: "RS256", kid: "test-key" })
    .setIssuer(claims.iss ?? ISSUER)
    .setAudience(claims.aud ?? FUDA_JWT_AUDIENCE)
    .setIssuedAt();

  if (claims.exp !== undefined) {
    builder.setExpirationTime(claims.exp);
  } else {
    builder.setExpirationTime("1h");
  }

  return builder.sign(privateKey);
}

describe("FudaJwtIdentityResolver", () => {
  before(async () => {
    keys = await createTestKeys();
  });

  it("resolves a valid Fuda JWT to a principal from claims only", async () => {
    const resolver = createResolver();
    const token = await signToken(keys.privateKey);

    const principal = await resolver.resolve(token);

    assert.deepEqual(principal, EXPECTED_PRINCIPAL);
  });

  it("rejects a token with an invalid signature", async () => {
    const resolver = createResolver();
    const token = await signToken(keys.otherPrivateKey);

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

  it("rejects a token missing agent_id", async () => {
    const resolver = createResolver();
    const token = await signToken(keys.privateKey, { omit: ["agent_id"] });

    await assert.rejects(
      () => resolver.resolve(token),
      (error: unknown) => {
        assert.ok(error instanceof IdentityResolutionError);
        assert.match(error.message, /agent_id/i);
        return true;
      },
    );
  });

  it("rejects a token missing bearer_id", async () => {
    const resolver = createResolver();
    const token = await signToken(keys.privateKey, { omit: ["bearer_id"] });

    await assert.rejects(
      () => resolver.resolve(token),
      (error: unknown) => {
        assert.ok(error instanceof IdentityResolutionError);
        assert.match(error.message, /bearer_id/i);
        return true;
      },
    );
  });
});
