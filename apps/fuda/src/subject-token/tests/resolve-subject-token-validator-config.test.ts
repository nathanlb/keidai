import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { K8S_SA_OIDC_SUBJECT_VALIDATOR_NOT_IMPLEMENTED } from "../k8s-sa-oidc-not-implemented.js";
import { createSubjectTokenValidator } from "../utils/create-subject-token-validator.js";
import { parseStaticSubjectMappings } from "../utils/parse-static-subject-mappings.js";
import {
  resolveSubjectTokenValidatorConfig,
  tryResolveSubjectTokenValidatorConfig,
} from "../utils/resolve-subject-token-validator-config.js";
import { tryResolveK8sSaOidcSubjectConfig } from "../utils/try-resolve-k8s-sa-oidc-subject-config.js";

describe("parseStaticSubjectMappings", () => {
  it("returns null when unset", () => {
    assert.equal(parseStaticSubjectMappings(undefined), null);
    assert.equal(parseStaticSubjectMappings(""), null);
    assert.equal(parseStaticSubjectMappings("  "), null);
  });

  it("parses credential=bearer_id entries", () => {
    const parsed = parseStaticSubjectMappings(
      "dev-secret=local-dev,ci-secret=ci-runner",
    );
    assert.ok(parsed && typeof parsed !== "string");
    assert.equal(parsed.mappings.get("dev-secret"), "local-dev");
    assert.equal(parsed.mappings.get("ci-secret"), "ci-runner");
  });

  it("rejects malformed and duplicate entries", () => {
    assert.match(
      parseStaticSubjectMappings("no-equals") as string,
      /expected credential=bearer_id/,
    );
    assert.match(
      parseStaticSubjectMappings("a=b,a=c") as string,
      /Duplicate credential/,
    );
  });
});

describe("tryResolveK8sSaOidcSubjectConfig", () => {
  it("returns null when all unset", () => {
    assert.equal(tryResolveK8sSaOidcSubjectConfig({}), null);
  });

  it("fails fast when partially configured", () => {
    assert.throws(
      () =>
        tryResolveK8sSaOidcSubjectConfig({
          FUDA_K8S_SA_OIDC_ISSUER: "https://kubernetes.default.svc",
        }),
      /partially configured/,
    );
  });

  it("returns config when all three are set", () => {
    assert.deepEqual(
      tryResolveK8sSaOidcSubjectConfig({
        FUDA_K8S_SA_OIDC_ISSUER: "https://kubernetes.default.svc",
        FUDA_K8S_SA_OIDC_AUDIENCE: "fuda",
        FUDA_K8S_SA_OIDC_JWKS_URI: "https://example.test/jwks",
      }),
      {
        issuer: "https://kubernetes.default.svc",
        audience: "fuda",
        jwksUri: "https://example.test/jwks",
      },
    );
  });
});

describe("resolveSubjectTokenValidatorConfig", () => {
  it("selects the static validator", () => {
    const config = resolveSubjectTokenValidatorConfig({
      FUDA_STATIC_SUBJECT_MAPPINGS: "dev-secret=local-dev",
    });
    assert.equal(config.kind, "static");
    if (config.kind === "static") {
      assert.equal(config.mappings.get("dev-secret"), "local-dev");
    }
  });

  it("selects k8s when only that group is set", () => {
    const config = resolveSubjectTokenValidatorConfig({
      FUDA_K8S_SA_OIDC_ISSUER: "https://kubernetes.default.svc",
      FUDA_K8S_SA_OIDC_AUDIENCE: "fuda",
      FUDA_K8S_SA_OIDC_JWKS_URI: "https://example.test/jwks",
    });
    assert.equal(config.kind, "k8s_sa_oidc");
  });

  it("fails on ambiguous configuration", () => {
    assert.throws(
      () =>
        resolveSubjectTokenValidatorConfig({
          FUDA_STATIC_SUBJECT_MAPPINGS: "dev-secret=local-dev",
          FUDA_K8S_SA_OIDC_ISSUER: "https://kubernetes.default.svc",
          FUDA_K8S_SA_OIDC_AUDIENCE: "fuda",
          FUDA_K8S_SA_OIDC_JWKS_URI: "https://example.test/jwks",
        }),
      /Ambiguous/,
    );
  });

  it("fails when nothing is configured", () => {
    assert.throws(() => resolveSubjectTokenValidatorConfig({}), /No subject/);
  });

  it("tryResolve returns null when nothing is configured", () => {
    assert.equal(tryResolveSubjectTokenValidatorConfig({}), null);
  });
});

describe("createSubjectTokenValidator", () => {
  it("builds a static validator that returns bearer_id only", async () => {
    const validator = createSubjectTokenValidator({
      kind: "static",
      mappings: new Map([["secret", "bearer-1"]]),
    });
    assert.equal(await validator.validate("secret"), "bearer-1");
  });

  it("refuses k8s until NAT-118 implements the adapter", () => {
    assert.throws(
      () =>
        createSubjectTokenValidator({
          kind: "k8s_sa_oidc",
          issuer: "https://kubernetes.default.svc",
          audience: "fuda",
          jwksUri: "https://example.test/jwks",
        }),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.equal(error.message, K8S_SA_OIDC_SUBJECT_VALIDATOR_NOT_IMPLEMENTED);
        return true;
      },
    );
  });
});
