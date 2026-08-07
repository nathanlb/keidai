import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  OPERATOR_API_ROUTES,
  isOperatorApiSsePath,
  rewriteOperatorApiPath,
  shouldHardenOperatorApiSse,
  type OperatorApiRoute,
} from "../operator-api-routes.js";

describe("OPERATOR_API_ROUTES", () => {
  it("lists more specific prefixes before the /api catch-all", () => {
    const prefixes = OPERATOR_API_ROUTES.map((route) => route.prefix);
    assert.equal(prefixes.at(-1), "/api");

    for (let i = 0; i < prefixes.length - 1; i += 1) {
      const current = prefixes[i]!;
      assert.notEqual(current, "/api");
      assert.ok(
        current.startsWith("/api") || current.startsWith("/oauth/"),
        `expected ${current} to be under /api or /oauth/`,
      );
    }
  });

  it("proxies Torii OAuth callbacks on the public origin", () => {
    const oauth = OPERATOR_API_ROUTES.find(
      (route) => route.prefix === "/oauth/callback",
    );
    assert.equal(oauth?.backend, "torii");
    assert.equal(oauth?.pathRewrite, undefined);
  });

  it("routes shaiden and fuda health aliases with path rewrites", () => {
    const shaidenHealth = OPERATOR_API_ROUTES.find(
      (route) => route.prefix === "/api/shaiden/health",
    );
    const fudaHealth = OPERATOR_API_ROUTES.find(
      (route) => route.prefix === "/api/fuda/health",
    );

    assert.deepEqual(shaidenHealth?.pathRewrite, {
      from: "/api/shaiden",
      to: "/api",
    });
    assert.deepEqual(fudaHealth?.pathRewrite, {
      from: "/api/fuda",
      to: "/api",
    });
    assert.equal(
      rewriteOperatorApiPath("/api/shaiden/health", shaidenHealth!),
      "/api/health",
    );
    assert.equal(
      rewriteOperatorApiPath("/api/fuda/health", fudaHealth!),
      "/api/health",
    );
  });

  it("marks runs and traces for SSE hardening", () => {
    const runs = OPERATOR_API_ROUTES.find((route) => route.prefix === "/api/runs");
    const traces = OPERATOR_API_ROUTES.find(
      (route) => route.prefix === "/api/traces",
    );

    assert.equal(runs?.sse, true);
    assert.equal(traces?.sse, true);
    assert.equal(shouldHardenOperatorApiSse("/api/runs/events", runs!), true);
    assert.equal(
      shouldHardenOperatorApiSse("/api/traces/events?cursor=1", traces!),
      true,
    );
    assert.equal(shouldHardenOperatorApiSse("/api/runs/abc", runs!), false);
  });
});

describe("isOperatorApiSsePath", () => {
  it("detects /events path segments", () => {
    assert.equal(isOperatorApiSsePath("/api/runs/events"), true);
    assert.equal(isOperatorApiSsePath("/api/traces/events?x=1"), true);
    assert.equal(isOperatorApiSsePath("/api/connections/events"), true);
    assert.equal(isOperatorApiSsePath("/api/runs/r1"), false);
  });
});

describe("rewriteOperatorApiPath", () => {
  it("leaves paths unchanged when no rewrite is configured", () => {
    const route: OperatorApiRoute = {
      prefix: "/api/tasks",
      backend: "shaiden",
    };
    assert.equal(rewriteOperatorApiPath("/api/tasks/runtime", route), "/api/tasks/runtime");
  });
});
