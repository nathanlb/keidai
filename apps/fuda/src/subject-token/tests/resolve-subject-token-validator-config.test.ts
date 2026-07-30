import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createSubjectTokenValidator } from "../utils/create-subject-token-validator.js";
import { parseK8sSaSubjectMappings } from "../utils/parse-k8s-sa-subject-mappings.js";
import { parseStaticSubjectMappings } from "../utils/parse-static-subject-mappings.js";
import {
  resolveSubjectTokenValidatorConfig,
  tryResolveSubjectTokenValidatorConfig,
} from "../utils/resolve-subject-token-validator-config.js";
import { tryResolveK8sSaOidcSubjectConfig } from "../utils/try-resolve-k8s-sa-oidc-subject-config.js";

const K8S_ENV = {
  FUDA_K8S_SA_OIDC_ISSUER: "https://kubernetes.default.svc",
  FUDA_K8S_SA_OIDC_AUDIENCE: "fuda",
  FUDA_K8S_SA_OIDC_JWKS_URI: "https://example.test/jwks",
  FUDA_K8S_SA_OIDC_SUBJECT_MAPPINGS: "agents/catalog=catalog-runner",
} as const;

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

describe("parseK8sSaSubjectMappings", () => {
  it("returns null when unset", () => {
    assert.equal(parseK8sSaSubjectMappings(undefined), null);
    assert.equal(parseK8sSaSubjectMappings(""), null);
  });

  it("stores kind-prefixed registry keys", () => {
    const parsed = parseK8sSaSubjectMappings(
      "agents/catalog=catalog-runner,default/other=other-bearer",
    );
    assert.ok(parsed && typeof parsed !== "string");
    assert.equal(
      parsed.get("k8s_service_account:agents/catalog"),
      "catalog-runner",
    );
    assert.equal(
      parsed.get("k8s_service_account:default/other"),
      "other-bearer",
    );
  });

  it("rejects malformed and duplicate entries", () => {
    assert.match(
      parseK8sSaSubjectMappings("no-slash=bearer") as string,
      /namespace\/serviceAccount/,
    );
    assert.match(
      parseK8sSaSubjectMappings("ns/sa=a,ns/sa=b") as string,
      /Duplicate subject/,
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
    assert.throws(
      () =>
        tryResolveK8sSaOidcSubjectConfig({
          FUDA_K8S_SA_OIDC_ISSUER: "https://kubernetes.default.svc",
          FUDA_K8S_SA_OIDC_AUDIENCE: "fuda",
          FUDA_K8S_SA_OIDC_JWKS_URI: "https://example.test/jwks",
        }),
      /partially configured/,
    );
  });

  it("returns config when all four are set", () => {
    const config = tryResolveK8sSaOidcSubjectConfig(K8S_ENV);
    assert.ok(config);
    assert.equal(config.issuer, K8S_ENV.FUDA_K8S_SA_OIDC_ISSUER);
    assert.equal(config.audience, "fuda");
    assert.equal(config.jwksUri, K8S_ENV.FUDA_K8S_SA_OIDC_JWKS_URI);
    assert.equal(
      config.mappings.get("k8s_service_account:agents/catalog"),
      "catalog-runner",
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
    const config = resolveSubjectTokenValidatorConfig(K8S_ENV);
    assert.equal(config.kind, "k8s_sa_oidc");
    if (config.kind === "k8s_sa_oidc") {
      assert.equal(
        config.mappings.get("k8s_service_account:agents/catalog"),
        "catalog-runner",
      );
    }
  });

  it("fails on ambiguous configuration", () => {
    assert.throws(
      () =>
        resolveSubjectTokenValidatorConfig({
          FUDA_STATIC_SUBJECT_MAPPINGS: "dev-secret=local-dev",
          ...K8S_ENV,
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

  it("builds a k8s validator from config", () => {
    const validator = createSubjectTokenValidator({
      kind: "k8s_sa_oidc",
      issuer: "https://kubernetes.default.svc",
      audience: "fuda",
      jwksUri: "https://example.test/jwks",
      mappings: new Map([
        ["k8s_service_account:agents/catalog", "catalog-runner"],
      ]),
    });
    assert.equal(typeof validator.validate, "function");
  });
});
