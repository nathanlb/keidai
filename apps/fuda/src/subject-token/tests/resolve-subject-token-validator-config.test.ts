import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PLATFORM_BEARER_ID } from "../../bearers/platform-bearer.js";
import { createSubjectTokenValidator } from "../utils/create-subject-token-validator.js";
import { parseK8sSaSubjects } from "../utils/parse-k8s-sa-subjects.js";
import { parseStaticSubjectTokens } from "../utils/parse-static-subject-tokens.js";
import {
  resolveSubjectTokenValidatorConfig,
  tryResolveSubjectTokenValidatorConfig,
} from "../utils/resolve-subject-token-validator-config.js";
import { tryResolveK8sSaOidcSubjectConfig } from "../utils/try-resolve-k8s-sa-oidc-subject-config.js";

const K8S_ENV = {
  FUDA_K8S_SA_OIDC_ISSUER: "https://kubernetes.default.svc",
  FUDA_K8S_SA_OIDC_AUDIENCE: "fuda",
  FUDA_K8S_SA_OIDC_JWKS_URI: "https://example.test/jwks",
  FUDA_K8S_SA_OIDC_SUBJECTS: "agents/catalog",
} as const;

describe("parseStaticSubjectTokens", () => {
  it("returns null when unset", () => {
    assert.equal(parseStaticSubjectTokens(undefined), null);
    assert.equal(parseStaticSubjectTokens(""), null);
    assert.equal(parseStaticSubjectTokens("  "), null);
  });

  it("parses a comma-separated allow-list", () => {
    const parsed = parseStaticSubjectTokens("dev-secret,ci-secret");
    assert.ok(parsed && typeof parsed !== "string");
    assert.equal(parsed.has("dev-secret"), true);
    assert.equal(parsed.has("ci-secret"), true);
    assert.equal(parsed.size, 2);
  });

  it("rejects duplicate tokens", () => {
    assert.match(
      parseStaticSubjectTokens("a,a") as string,
      /Duplicate token/,
    );
  });

  it("rejects the old mapping format", () => {
    assert.match(
      parseStaticSubjectTokens("dev-secret=local-dev") as string,
      /not secret=bearer_id/,
    );
  });
});

describe("parseK8sSaSubjects", () => {
  it("returns null when unset", () => {
    assert.equal(parseK8sSaSubjects(undefined), null);
    assert.equal(parseK8sSaSubjects(""), null);
  });

  it("stores kind-prefixed registry keys", () => {
    const parsed = parseK8sSaSubjects("agents/catalog,default/other");
    assert.ok(parsed && typeof parsed !== "string");
    assert.equal(parsed.has("k8s_service_account:agents/catalog"), true);
    assert.equal(parsed.has("k8s_service_account:default/other"), true);
  });

  it("rejects malformed, mapping, and duplicate entries", () => {
    assert.match(
      parseK8sSaSubjects("no-slash") as string,
      /namespace\/serviceAccount/,
    );
    assert.match(
      parseK8sSaSubjects("ns/sa=bearer") as string,
      /not namespace\/serviceAccount=bearer_id/,
    );
    assert.match(
      parseK8sSaSubjects("ns/sa,ns/sa") as string,
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
      config.subjects.has("k8s_service_account:agents/catalog"),
      true,
    );
  });

  it("allows omitting issuer for in-cluster discovery", () => {
    const config = tryResolveK8sSaOidcSubjectConfig({
      FUDA_K8S_SA_OIDC_AUDIENCE: "fuda",
      FUDA_K8S_SA_OIDC_JWKS_URI: "https://example.test/jwks",
      FUDA_K8S_SA_OIDC_SUBJECTS: "agents/catalog",
    });
    assert.ok(config);
    assert.equal(config.issuer, "");
    assert.equal(config.audience, "fuda");
  });
});

describe("resolveSubjectTokenValidatorConfig", () => {
  it("selects the static validator", () => {
    const config = resolveSubjectTokenValidatorConfig({
      FUDA_STATIC_SUBJECT_TOKEN: "dev-secret",
    });
    assert.equal(config.kind, "static");
    if (config.kind === "static") {
      assert.equal(config.tokens.has("dev-secret"), true);
    }
  });

  it("selects k8s when only that group is set", () => {
    const config = resolveSubjectTokenValidatorConfig(K8S_ENV);
    assert.equal(config.kind, "k8s_sa_oidc");
    if (config.kind === "k8s_sa_oidc") {
      assert.equal(
        config.subjects.has("k8s_service_account:agents/catalog"),
        true,
      );
    }
  });

  it("fails on ambiguous configuration", () => {
    assert.throws(
      () =>
        resolveSubjectTokenValidatorConfig({
          FUDA_STATIC_SUBJECT_TOKEN: "dev-secret",
          ...K8S_ENV,
        }),
      /Ambiguous/,
    );
  });

  it("fails when nothing is configured", () => {
    assert.throws(() => resolveSubjectTokenValidatorConfig({}), /No subject/);
  });

  it("fails closed on removed mapping env vars", () => {
    assert.throws(
      () =>
        resolveSubjectTokenValidatorConfig({
          FUDA_STATIC_SUBJECT_MAPPINGS: "dev-secret=local-dev",
        }),
      /FUDA_STATIC_SUBJECT_MAPPINGS is removed/,
    );
    assert.throws(
      () =>
        resolveSubjectTokenValidatorConfig({
          FUDA_K8S_SA_OIDC_SUBJECT_MAPPINGS: "agents/catalog=catalog-runner",
        }),
      /FUDA_K8S_SA_OIDC_SUBJECT_MAPPINGS is removed/,
    );
  });

  it("tryResolve returns null when nothing is configured", () => {
    assert.equal(tryResolveSubjectTokenValidatorConfig({}), null);
  });
});

describe("createSubjectTokenValidator", () => {
  it("builds a static validator that returns the platform bearer_id", async () => {
    const validator = createSubjectTokenValidator({
      kind: "static",
      tokens: new Set(["secret"]),
    });
    assert.equal(await validator.validate("secret"), PLATFORM_BEARER_ID);
  });

  it("builds a k8s validator from config", () => {
    const validator = createSubjectTokenValidator({
      kind: "k8s_sa_oidc",
      issuer: "https://kubernetes.default.svc",
      audience: "fuda",
      jwksUri: "https://example.test/jwks",
      subjects: new Set(["k8s_service_account:agents/catalog"]),
    });
    assert.equal(typeof validator.validate, "function");
  });
});
