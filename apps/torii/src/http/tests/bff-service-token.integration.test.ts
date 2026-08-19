import "reflect-metadata";
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { bffServiceTokenAuthorizationHeader } from "@keidai/shared/bff-service-token";
import {
  createStubToolCatalog,
  createTestGatewayHttpServer,
} from "./test-helpers.js";

const TOKEN = "torii-bff-service-token";

describe("Torii BFF service token gate", () => {
  afterEach(() => {
    delete process.env.BFF_SERVICE_TOKEN;
    process.env.BFF_SERVICE_TOKEN_DISABLED = "true";
  });

  it("rejects management API calls without a valid token", async () => {
    delete process.env.BFF_SERVICE_TOKEN_DISABLED;
    process.env.BFF_SERVICE_TOKEN = TOKEN;
    const gateway = await (
      await createTestGatewayHttpServer(
        createStubToolCatalog(),
        {} as never,
      )
    ).start();

    try {
      const unauthorized = await fetch(`${gateway.baseUrl}/api/config/servers`);
      assert.equal(unauthorized.status, 401);

      const wrong = await fetch(`${gateway.baseUrl}/api/config/servers`, {
        headers: {
          authorization: bffServiceTokenAuthorizationHeader("wrong"),
        },
      });
      assert.equal(wrong.status, 401);

      const ok = await fetch(`${gateway.baseUrl}/api/config/servers`, {
        headers: {
          authorization: bffServiceTokenAuthorizationHeader(TOKEN),
        },
      });
      assert.equal(ok.status, 200);

      const health = await fetch(`${gateway.baseUrl}/api/health`);
      assert.equal(health.status, 200);
    } finally {
      await gateway.close();
    }
  });
});
