import "reflect-metadata";
import assert from "node:assert/strict";
import http from "node:http";
import { describe, it } from "node:test";
import type { ToriiConfig } from "@keidai/shared";
import { ConnectionManager } from "../../connections/connection-manager.service.js";
import { DefaultMcpClientConnector } from "../../connections/mcp-client-connector.service.js";
import { startMockMcpServer } from "../../connections/tests/mock-mcp-server.js";
import { ToriiConfigService } from "../../config/torii-config.service.js";
import type { ConnectionStatus, ConnectionsResponse } from "@keidai/shared";
import type { GatewayHttpServer } from "../gateway-http-server.service.js";
import { createStubToolCatalog, createTestGatewayHttpServer } from "./test-helpers.js";
import { createNoopLogger } from "../../logging/tests/test-helpers.js";
import {
  createCredentialServices,
  withStubAgentPrincipal,
} from "../../credentials/tests/test-helpers.js";

function serverConfig(
  name: string,
  url: string,
): ToriiConfig["servers"][number] {
  return {
    name,
    transport: { type: "http", url },
    credential: { strategy: "none" },
    policy: { default: "deny" },
  };
}

async function closeManagerConnections(
  manager: ConnectionManager,
): Promise<void> {
  await Promise.all(
    manager
      .list()
      .map((connection) => connection.client?.close())
      .filter((close): close is Promise<void> => close !== undefined),
  );
}

function createConnectionsGateway(
  configService: ToriiConfigService,
  connectionManager: ConnectionManager,
): GatewayHttpServer {
  return createTestGatewayHttpServer(
    createStubToolCatalog(),
    {} as never,
    {
      configService,
      connectionManager,
    },
  );
}

function parseSseChunk(chunk: string): Array<{ event: string; data: string }> {
  return chunk
    .split("\n\n")
    .filter(Boolean)
    .map((block) => {
      const lines = block.split("\n");
      const eventLine = lines.find((line) => line.startsWith("event: "));
      const dataLine = lines.find((line) => line.startsWith("data: "));
      if (!eventLine || !dataLine) {
        return null;
      }
      return {
        event: eventLine.slice("event: ".length),
        data: dataLine.slice("data: ".length),
      };
    })
    .filter((event): event is { event: string; data: string } => event !== null);
}

async function readSseEventsUntil(
  url: string,
  predicate: (
    events: Array<{ event: string; connection: ConnectionStatus }>,
  ) => boolean,
  timeoutMs = 5_000,
): Promise<Array<{ event: string; connection: ConnectionStatus }>> {
  return new Promise((resolve, reject) => {
    const parsed: Array<{
      event: string;
      connection: ConnectionStatus;
    }> = [];
    let buffer = "";

    const req = http.get(url, (res) => {
      assert.equal(res.statusCode, 200);
      res.on("data", (chunk) => {
        buffer += chunk.toString();
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";

        for (const part of parts) {
          const event = parseSseChunk(`${part}\n\n`)[0];
          if (!event) {
            continue;
          }
          parsed.push({
            event: event.event,
            connection: JSON.parse(event.data) as ConnectionStatus,
          });
        }

        if (predicate(parsed)) {
          req.destroy();
          resolve(parsed);
        }
      });
    });

    req.on("error", (error) => {
      if ((error as NodeJS.ErrnoException).code === "ECONNRESET") {
        resolve(parsed);
        return;
      }
      reject(error);
    });

    setTimeout(() => {
      req.destroy();
      reject(new Error("timed out waiting for SSE events"));
    }, timeoutMs);
  });
}

describe("Gateway /api/connections endpoints", () => {
  it("returns current connection state per server", async () => {
    const goodServer = await startMockMcpServer();
    const badServer = await startMockMcpServer({ rejectConnections: true });
    const configService = new ToriiConfigService({
      oauth_providers: {},
      servers: [
        serverConfig("good", goodServer.url),
        serverConfig("bad", badServer.url),
      ],
    });
    const { credentialResolver } = createCredentialServices();
    const connectionManager = new ConnectionManager(configService, new DefaultMcpClientConnector(credentialResolver), createNoopLogger());
    const gatewayHttpServer = createConnectionsGateway(
      configService,
      connectionManager,
    );

    try {
      await withStubAgentPrincipal(() => connectionManager.connectAll());
      const gateway = await gatewayHttpServer.start();
      try {
        const response = await fetch(`${gateway.baseUrl}/api/connections`);
        assert.equal(response.status, 200);

        const body = (await response.json()) as ConnectionsResponse;
        const byName = new Map(
          body.connections.map((connection) => [connection.name, connection]),
        );

        assert.equal(byName.get("good")?.state, "connected");
        assert.equal(byName.get("good")?.error, undefined);
        assert.equal(byName.get("bad")?.state, "failed");
        assert.ok(byName.get("bad")?.error);
        assert.equal(JSON.stringify(body).includes("secret"), false);
      } finally {
        await gateway.close();
      }
    } finally {
      await closeManagerConnections(connectionManager);
      await Promise.all([goodServer.close(), badServer.close()]);
    }
  });

  it("streams connection state changes over SSE", async () => {
    const mockServer = await startMockMcpServer();
    const configService = new ToriiConfigService({
      oauth_providers: {},
      servers: [serverConfig("alpha", mockServer.url)],
    });
    const { credentialResolver } = createCredentialServices();
    const connectionManager = new ConnectionManager(configService, new DefaultMcpClientConnector(credentialResolver), createNoopLogger());
    const gatewayHttpServer = createConnectionsGateway(
      configService,
      connectionManager,
    );

    try {
      const gateway = await gatewayHttpServer.start();
      try {
        const eventsPromise = readSseEventsUntil(
          `${gateway.baseUrl}/api/connections/events`,
          (events) =>
            events.some((entry) => entry.connection.state === "connected"),
        );

        await withStubAgentPrincipal(() => connectionManager.connectAll());
        const events = await eventsPromise;

        assert.ok(
          events.some(
            (entry) =>
              entry.event === "connection_state_changed" &&
              entry.connection.name === "alpha" &&
              entry.connection.state === "connecting",
          ),
        );
        assert.ok(
          events.some(
            (entry) =>
              entry.event === "connection_state_changed" &&
              entry.connection.name === "alpha" &&
              entry.connection.state === "connected",
          ),
        );
      } finally {
        await gateway.close();
      }
    } finally {
      await closeManagerConnections(connectionManager);
      await mockServer.close();
    }
  });
});
