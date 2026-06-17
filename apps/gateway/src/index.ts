#!/usr/bin/env node
import "dotenv/config";
import "reflect-metadata";
import { ConnectionManager } from "./backends/connection-manager.service.js";
import { ToolCatalogService } from "./catalog/tool-catalog.service.js";
import { ToriiConfigService } from "./config/torii-config.service.js";
import { loadConfig, reportConfigError } from "./config/utils/loader.js";
import { createContainer } from "./container.js";
import { GatewayMcpServer } from "./mcp/gateway-mcp-server.service.js";

function resolvePort(): number {
  const raw = process.env.TORII_PORT ?? process.env.PORT ?? "3100";
  const port = Number.parseInt(raw, 10);
  if (!Number.isFinite(port) || port <= 0) {
    throw new Error(`Invalid gateway port: ${raw}`);
  }
  return port;
}

async function main(): Promise<void> {
  const config = await loadConfig();
  const app = createContainer(config);
  const configService = app.resolve(ToriiConfigService);
  const connectionManager = app.resolve(ConnectionManager);
  const toolCatalog = app.resolve(ToolCatalogService);
  const gatewayMcpServer = app.resolve(GatewayMcpServer);

  console.log(
    `Loaded Torii config with ${configService.get().servers.length} server(s)`,
  );

  await connectionManager.connectAll();

  const connections = connectionManager.list();
  const connected = connections.filter(
    (connection) => connection.state === "connected",
  ).length;
  const failed = connections.filter(
    (connection) => connection.state === "failed",
  ).length;

  console.log(`Backend connections: ${connected} connected, ${failed} failed`);

  const catalog = await toolCatalog.refresh();
  console.log(`Tool catalog: ${catalog.length} tool(s) from connected backends`);

  const gateway = await gatewayMcpServer.start({
    host: process.env.TORII_HOST ?? "127.0.0.1",
    port: resolvePort(),
  });
  console.log(`Gateway MCP endpoint: ${gateway.url}`);
}

main().catch(reportConfigError);
