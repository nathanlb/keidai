import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { describe, it } from "node:test";
import { writeTempSigningKeyPem } from "../../signing/tests/test-helpers.js";
import {
  ConfigValidationError,
  loadRuntimeConfig,
} from "../runtime-config.js";

function envWithTempDbAndKey(
  overrides: NodeJS.ProcessEnv = {},
): NodeJS.ProcessEnv {
  const keyPath = writeTempSigningKeyPem("default");
  return {
    FUDA_DATABASE_URL: "postgres://fuda:fuda@127.0.0.1:5432/fuda",
    FUDA_SIGNING_KEYS: `default=${keyPath}`,
    FUDA_SIGNING_KID: "default",
    FUDA_ISSUER: "https://fuda.test",
    FUDA_STATIC_SUBJECT_MAPPINGS: "dev-secret=local-dev",
    ...overrides,
  };
}

describe("loadRuntimeConfig", () => {
  it("defaults to localhost, port 3300, and all route groups", () => {
    const { config, subjectTokenValidatorConfig } = loadRuntimeConfig(
      envWithTempDbAndKey(),
    );
    assert.equal(config.httpHost, "127.0.0.1");
    assert.equal(config.httpPort, 3300);
    assert.deepEqual(config.listenGroups, ["public", "agent", "management"]);
    assert.equal(config.signingKeys.signingKid, "default");
    assert.equal(config.signingKeys.keys.length, 1);
    assert.equal(config.tokenIssuer, "https://fuda.test");
    assert.equal(config.subjectTokenValidator?.kind, "static");
    assert.deepEqual(config.subjectTokenValidator, { kind: "static" });
    assert.equal(subjectTokenValidatorConfig?.kind, "static");
    if (subjectTokenValidatorConfig?.kind === "static") {
      assert.equal(
        subjectTokenValidatorConfig.mappings.get("dev-secret"),
        "local-dev",
      );
    }
  });

  it("parses a subset of listen groups for network separation", () => {
    const { config } = loadRuntimeConfig(
      envWithTempDbAndKey({ FUDA_LISTEN_GROUPS: "public" }),
    );
    assert.deepEqual(config.listenGroups, ["public"]);
  });

  it("allows omitting subject validator when agent group is not enabled", () => {
    const { config, subjectTokenValidatorConfig } = loadRuntimeConfig(
      envWithTempDbAndKey({
        FUDA_LISTEN_GROUPS: "public",
        FUDA_STATIC_SUBJECT_MAPPINGS: "",
      }),
    );
    assert.equal(config.subjectTokenValidator, null);
    assert.equal(subjectTokenValidatorConfig, null);
  });

  it("fails fast when agent group is enabled without a subject validator", () => {
    assert.throws(
      () =>
        loadRuntimeConfig(
          envWithTempDbAndKey({ FUDA_STATIC_SUBJECT_MAPPINGS: "" }),
        ),
      (error: unknown) => {
        assert.ok(error instanceof ConfigValidationError);
        assert.match(error.errors.join("\n"), /Subject token validator/);
        return true;
      },
    );
  });

  it("aggregates missing subject validator with other boot errors", () => {
    assert.throws(
      () =>
        loadRuntimeConfig(
          envWithTempDbAndKey({
            FUDA_STATIC_SUBJECT_MAPPINGS: "",
            FUDA_PORT: "nope",
          }),
        ),
      (error: unknown) => {
        assert.ok(error instanceof ConfigValidationError);
        const joined = error.errors.join("\n");
        assert.match(joined, /FUDA_PORT/);
        assert.match(joined, /Subject token validator/);
        return true;
      },
    );
  });

  it("does not duplicate required-validator error when subject env already failed", () => {
    assert.throws(
      () =>
        loadRuntimeConfig(
          envWithTempDbAndKey({
            FUDA_STATIC_SUBJECT_MAPPINGS: "no-equals",
          }),
        ),
      (error: unknown) => {
        assert.ok(error instanceof ConfigValidationError);
        const joined = error.errors.join("\n");
        assert.match(joined, /expected credential=bearer_id/);
        assert.doesNotMatch(joined, /Subject token validator required/);
        return true;
      },
    );
  });

  it("fails fast on ambiguous subject validator configuration", () => {
    assert.throws(
      () =>
        loadRuntimeConfig(
          envWithTempDbAndKey({
            FUDA_K8S_SA_OIDC_ISSUER: "https://kubernetes.default.svc",
            FUDA_K8S_SA_OIDC_AUDIENCE: "fuda",
            FUDA_K8S_SA_OIDC_JWKS_URI: "https://example.test/jwks",
            FUDA_K8S_SA_OIDC_SUBJECT_MAPPINGS: "agents/catalog=catalog-runner",
          }),
        ),
      (error: unknown) => {
        assert.ok(error instanceof ConfigValidationError);
        assert.match(error.errors.join("\n"), /Ambiguous/);
        return true;
      },
    );
  });

  it("fails fast on partially configured k8s SA OIDC", () => {
    assert.throws(
      () =>
        loadRuntimeConfig(
          envWithTempDbAndKey({
            FUDA_STATIC_SUBJECT_MAPPINGS: "",
            FUDA_LISTEN_GROUPS: "public",
            FUDA_K8S_SA_OIDC_ISSUER: "https://kubernetes.default.svc",
          }),
        ),
      (error: unknown) => {
        assert.ok(error instanceof ConfigValidationError);
        assert.match(error.errors.join("\n"), /partially configured/);
        return true;
      },
    );
  });

  it("selects k8s SA OIDC when that group is fully configured", () => {
    const { config, subjectTokenValidatorConfig } = loadRuntimeConfig(
      envWithTempDbAndKey({
        FUDA_STATIC_SUBJECT_MAPPINGS: "",
        FUDA_K8S_SA_OIDC_ISSUER: "https://kubernetes.default.svc",
        FUDA_K8S_SA_OIDC_AUDIENCE: "fuda",
        FUDA_K8S_SA_OIDC_JWKS_URI: "https://example.test/jwks",
        FUDA_K8S_SA_OIDC_SUBJECT_MAPPINGS: "agents/catalog=catalog-runner",
      }),
    );
    assert.equal(config.subjectTokenValidator?.kind, "k8s_sa_oidc");
    assert.equal(subjectTokenValidatorConfig?.kind, "k8s_sa_oidc");
    if (subjectTokenValidatorConfig?.kind === "k8s_sa_oidc") {
      assert.equal(
        subjectTokenValidatorConfig.mappings.get(
          "k8s_service_account:agents/catalog",
        ),
        "catalog-runner",
      );
    }
  });

  it("parses two signing keys for rotation", () => {
    const oldPath = writeTempSigningKeyPem("old");
    const newPath = writeTempSigningKeyPem("new");
    const { config } = loadRuntimeConfig(
      envWithTempDbAndKey({
        FUDA_SIGNING_KEYS: `old=${oldPath},new=${newPath}`,
        FUDA_SIGNING_KID: "new",
      }),
    );
    assert.equal(config.signingKeys.signingKid, "new");
    assert.deepEqual(
      config.signingKeys.keys.map((key) => key.kid),
      ["old", "new"],
    );
  });

  it("parses env-sourced signing key material", () => {
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const pem = privateKey.export({ type: "pkcs8", format: "pem" }) as string;
    const { config } = loadRuntimeConfig(
      envWithTempDbAndKey({
        FUDA_SIGNING_KEYS: "env-key=env:FUDA_TEST_SIGNING_PEM",
        FUDA_SIGNING_KID: "env-key",
        FUDA_TEST_SIGNING_PEM: pem,
      }),
    );
    assert.equal(config.signingKeys.keys[0]?.material.kind, "env");
  });

  it("fails fast on missing signing keys", () => {
    assert.throws(
      () =>
        loadRuntimeConfig(
          envWithTempDbAndKey({
            FUDA_SIGNING_KEYS: "",
            FUDA_SIGNING_KID: "default",
          }),
        ),
      (error: unknown) => {
        assert.ok(error instanceof ConfigValidationError);
        assert.match(error.errors.join("\n"), /FUDA_SIGNING_KEYS/);
        return true;
      },
    );
  });

  it("fails fast on missing issuer", () => {
    assert.throws(
      () =>
        loadRuntimeConfig(
          envWithTempDbAndKey({
            FUDA_ISSUER: "",
          }),
        ),
      (error: unknown) => {
        assert.ok(error instanceof ConfigValidationError);
        assert.match(error.errors.join("\n"), /FUDA_ISSUER/);
        return true;
      },
    );
  });

  it("fails fast on invalid issuer URL", () => {
    assert.throws(
      () =>
        loadRuntimeConfig(
          envWithTempDbAndKey({
            FUDA_ISSUER: "not-a-url",
          }),
        ),
      (error: unknown) => {
        assert.ok(error instanceof ConfigValidationError);
        assert.match(error.errors.join("\n"), /FUDA_ISSUER/);
        return true;
      },
    );
  });

  it("fails fast when signing kid is not in the key list", () => {
    assert.throws(
      () =>
        loadRuntimeConfig(
          envWithTempDbAndKey({ FUDA_SIGNING_KID: "missing" }),
        ),
      (error: unknown) => {
        assert.ok(error instanceof ConfigValidationError);
        assert.match(error.errors.join("\n"), /FUDA_SIGNING_KID/);
        return true;
      },
    );
  });

  it("fails fast on invalid port", () => {
    assert.throws(
      () => loadRuntimeConfig(envWithTempDbAndKey({ FUDA_PORT: "nope" })),
      (error: unknown) => {
        assert.ok(error instanceof ConfigValidationError);
        assert.match(error.errors.join("\n"), /FUDA_PORT/);
        return true;
      },
    );
  });

  it("fails fast on unknown listen group", () => {
    assert.throws(
      () =>
        loadRuntimeConfig(
          envWithTempDbAndKey({ FUDA_LISTEN_GROUPS: "public,jwks" }),
        ),
      (error: unknown) => {
        assert.ok(error instanceof ConfigValidationError);
        assert.match(error.errors.join("\n"), /jwks/);
        return true;
      },
    );
  });

  it("fails fast on empty listen groups", () => {
    assert.throws(
      () =>
        loadRuntimeConfig(
          envWithTempDbAndKey({ FUDA_LISTEN_GROUPS: " , " }),
        ),
      ConfigValidationError,
    );
  });
});
