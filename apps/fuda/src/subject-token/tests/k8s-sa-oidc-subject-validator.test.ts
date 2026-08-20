import assert from "node:assert/strict";
import { generateKeyPair, exportJWK, SignJWT, type JWK } from "jose";
import { describe, it, before } from "node:test";
import { PLATFORM_BEARER_ID } from "../../bearers/platform-bearer.js";
import { SubjectTokenValidationError } from "../types/subject-token-validation-error.js";
import type { K8sSaOidcSubjectConfig } from "../types/k8s-sa-oidc-subject-config.js";
import { registryKey } from "../utils/registry-key.js";
import {
  K8sSaOidcSubjectValidator,
  type JwtVerifyKey,
} from "../validators/k8s-sa-oidc-subject-validator.js";

const ISSUER = "https://kubernetes.default.svc.cluster.local";
const AUDIENCE = "fuda";
const NAMESPACE = "agents";
const SERVICE_ACCOUNT = "catalog-agent";
const oidcConfig: K8sSaOidcSubjectConfig = {
  issuer: ISSUER,
  audience: AUDIENCE,
  jwksUri: "https://kubernetes.default.svc/openid/v1/jwks",
  subjects: new Set([
    registryKey({
      kind: "k8s_service_account",
      namespace: NAMESPACE,
      serviceAccountName: SERVICE_ACCOUNT,
    }),
  ]),
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

function createVerifyKey(): JwtVerifyKey {
  return async (header: { kid?: string }) => {
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
}

function createValidator(
  config: K8sSaOidcSubjectConfig = oidcConfig,
): K8sSaOidcSubjectValidator {
  return new K8sSaOidcSubjectValidator(config, createVerifyKey());
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

describe("K8sSaOidcSubjectValidator", () => {
  before(async () => {
    keys = await createTestKeys();
  });

  it("maps a valid projected SA token to bearer_id", async () => {
    const validator = createValidator();
    const token = await signToken(keys.privateKey, {
      sub: `system:serviceaccount:${NAMESPACE}:${SERVICE_ACCOUNT}`,
    });

    const bearerId = await validator.validate(token);

    assert.equal(bearerId, PLATFORM_BEARER_ID);
    assert.ok(!bearerId.includes("system:serviceaccount:"));
  });

  it("rejects a token with an invalid signature", async () => {
    const validator = createValidator();
    const token = await signToken(keys.otherPrivateKey, {
      sub: `system:serviceaccount:${NAMESPACE}:${SERVICE_ACCOUNT}`,
    });

    await assert.rejects(
      () => validator.validate(token),
      (error: unknown) => {
        assert.ok(error instanceof SubjectTokenValidationError);
        assert.match(error.message, /signature|validation failed/i);
        return true;
      },
    );
  });

  it("rejects a token with the wrong audience", async () => {
    const validator = createValidator();
    const token = await signToken(keys.privateKey, {
      sub: `system:serviceaccount:${NAMESPACE}:${SERVICE_ACCOUNT}`,
      aud: "https://wrong-audience.example",
    });

    await assert.rejects(
      () => validator.validate(token),
      (error: unknown) => {
        assert.ok(error instanceof SubjectTokenValidationError);
        assert.match(error.message, /aud/i);
        return true;
      },
    );
  });

  it("rejects a token with the wrong issuer", async () => {
    const validator = createValidator();
    const token = await signToken(keys.privateKey, {
      sub: `system:serviceaccount:${NAMESPACE}:${SERVICE_ACCOUNT}`,
      iss: "https://wrong-issuer.example",
    });

    await assert.rejects(
      () => validator.validate(token),
      (error: unknown) => {
        assert.ok(error instanceof SubjectTokenValidationError);
        assert.match(error.message, /iss/i);
        return true;
      },
    );
  });

  it("rejects an expired token", async () => {
    const validator = createValidator();
    const token = await signToken(keys.privateKey, {
      sub: `system:serviceaccount:${NAMESPACE}:${SERVICE_ACCOUNT}`,
      exp: Math.floor(Date.now() / 1000) - 60,
    });

    await assert.rejects(
      () => validator.validate(token),
      (error: unknown) => {
        assert.ok(error instanceof SubjectTokenValidationError);
        assert.match(error.message, /expired/i);
        return true;
      },
    );
  });

  it("rejects a token for an unmapped service account", async () => {
    const validator = createValidator();
    const token = await signToken(keys.privateKey, {
      sub: "system:serviceaccount:agents:unknown-agent",
    });

    await assert.rejects(
      () => validator.validate(token),
      (error: unknown) => {
        assert.ok(error instanceof SubjectTokenValidationError);
        assert.equal(error.message, "Invalid subject token");
        return true;
      },
    );
  });

  it("rejects a token whose subject is not a Kubernetes service account", async () => {
    const validator = createValidator();
    const token = await signToken(keys.privateKey, {
      sub: "spiffe://cluster.local/ns/agents/sa/catalog-agent",
    });

    await assert.rejects(
      () => validator.validate(token),
      (error: unknown) => {
        assert.ok(error instanceof SubjectTokenValidationError);
        assert.match(error.message, /not a Kubernetes service account/i);
        return true;
      },
    );
  });

  it("prefixes registryKey with kind", () => {
    assert.equal(
      registryKey({
        kind: "k8s_service_account",
        namespace: "ns",
        serviceAccountName: "sa",
      }),
      "k8s_service_account:ns/sa",
    );
  });
});
