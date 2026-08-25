import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { discoverClusterOidcIssuer } from "../utils/discover-cluster-oidc-issuer.js";

describe("discoverClusterOidcIssuer", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it("fails when not in-cluster and issuer would be required", async () => {
    await assert.rejects(
      () => discoverClusterOidcIssuer({}),
      /not in-cluster/,
    );
  });

  it("reads issuer from well-known discovery via kubernetes.default.svc", async () => {
    let requested: string | undefined;
    mock.method(globalThis, "fetch", async (url: string | URL) => {
      requested = String(url);
      return new Response(
        JSON.stringify({
          issuer: "https://kubernetes.default.svc.cluster.local",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });

    const issuer = await discoverClusterOidcIssuer({
      KUBERNETES_SERVICE_HOST: "10.0.0.1",
      KUBERNETES_SERVICE_PORT: "443",
    });
    assert.equal(issuer, "https://kubernetes.default.svc.cluster.local");
    assert.equal(
      requested,
      "https://kubernetes.default.svc:443/.well-known/openid-configuration",
    );
  });

  it("fails on non-OK discovery response", async () => {
    mock.method(globalThis, "fetch", async () => {
      return new Response("nope", { status: 401 });
    });

    await assert.rejects(
      () =>
        discoverClusterOidcIssuer({
          KUBERNETES_SERVICE_HOST: "10.0.0.1",
        }),
      /HTTP 401/,
    );
  });
});
