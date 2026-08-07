import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import {
  createClusterRemoteJwkSet,
  DEFAULT_CLUSTER_SA_TOKEN_PATH,
} from "../utils/create-cluster-remote-jwk-set.js";

describe("createClusterRemoteJwkSet", () => {
  it("falls back to anonymous remote JWKS when no token file exists", () => {
    const missing = path.join(
      mkdtempSync(path.join(tmpdir(), "fuda-jwks-")),
      "missing-token",
    );
    // Should not throw; returns a jose RemoteJWKSet function.
    const key = createClusterRemoteJwkSet(
      "https://example.test/openid/v1/jwks",
      missing,
    );
    assert.equal(typeof key, "function");
  });

  it("default token path constant matches the in-cluster mount", () => {
    assert.equal(
      DEFAULT_CLUSTER_SA_TOKEN_PATH,
      "/var/run/secrets/kubernetes.io/serviceaccount/token",
    );
  });

  it("builds an authenticated resolver when a token file exists", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "fuda-jwks-"));
    const tokenFile = path.join(dir, "token");
    writeFileSync(tokenFile, "cluster-sa-token\n", "utf8");
    const key = createClusterRemoteJwkSet(
      "https://example.test/openid/v1/jwks",
      tokenFile,
    );
    assert.equal(typeof key, "function");
  });
});
