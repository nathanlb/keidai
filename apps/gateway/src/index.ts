#!/usr/bin/env node
import "reflect-metadata";
import { loadConfig, reportConfigError } from "./config/loader.js";
import { ToriiConfigService } from "./config/torii-config.service.js";
import { createContainer } from "./container.js";
import { ConnectionManager } from "./backends/connection-manager.js";

async function main(): Promise<void> {
  const config = await loadConfig();
  const app = createContainer(config);
  const configService = app.resolve(ToriiConfigService);
  const connectionManager = app.resolve(ConnectionManager);

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
}

main().catch(reportConfigError);
