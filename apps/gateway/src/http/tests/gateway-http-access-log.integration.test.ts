import "reflect-metadata";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ToriiConfigService } from "../../config/torii-config.service.js";
import { ConfigApiController } from "../../config/config-api.controller.js";
import { ConfigReadService } from "../../config/config-read.service.js";
import { ConnectionsApiController } from "../../connections/connections-api.controller.js";
import { ConnectionReadService } from "../../connections/connection-read.service.js";
import { ConnectionManager } from "../../connections/connection-manager.service.js";
import { GatewayHttpServer } from "../gateway-http-server.service.js";
import { GatewayMcpServer } from "../../mcp/gateway-mcp-server.service.js";
import { CapturingTraceEmitter } from "../../trace/tests/capturing-trace-emitter.js";
import { createCapturingLogger } from "../../logging/tests/test-helpers.js";
import { createOAuthApiController, createStubToolCatalog } from "./test-helpers.js";

describe("Gateway HTTP access logging", () => {
  it("emits structured access logs without secrets", async () => {
    const logger = createCapturingLogger();
    const configService = new ToriiConfigService({
      oauth_providers: {},
      servers: [],
      agents: [],
    });
    const connectionManager = new ConnectionManager(
      configService,
      {
        connect: async () => {
          throw new Error("unused");
        },
      },
      logger,
    );
    const gatewayHttpServer = new GatewayHttpServer(
      new ConfigApiController(new ConfigReadService(configService)),
      new ConnectionsApiController(
        new ConnectionReadService(connectionManager, createStubToolCatalog()),
        connectionManager,
      ),
      createOAuthApiController(configService),
      new GatewayMcpServer(
        {} as never,
        {} as never,
        {} as never,
        new CapturingTraceEmitter(),
        logger,
      ),
      logger,
    );

    const gateway = await gatewayHttpServer.start();
    try {
      const response = await fetch(`${gateway.baseUrl}/api/config/servers`, {
        headers: {
          Authorization: "Bearer super-secret-token",
        },
      });
      assert.equal(response.status, 200);

      const accessLog = logger.logs.find((entry) => entry.event === "http.request");
      assert.ok(accessLog);
      assert.equal(accessLog.fields.method, "GET");
      assert.equal(accessLog.fields.url, "/api/config/servers");
      assert.equal(accessLog.fields.statusCode, 200);
      assert.equal(typeof accessLog.fields.durationMs, "number");

      const serialized = JSON.stringify(logger.logs);
      assert.doesNotMatch(serialized, /super-secret-token/);
      assert.doesNotMatch(serialized, /Bearer/);
    } finally {
      await gateway.close();
    }
  });
});
