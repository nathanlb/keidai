#!/usr/bin/env node
import { loadEnvForPackage } from "@keidai/shared";

loadEnvForPackage(import.meta.url);

import "reflect-metadata";
import { loadConfig, reportConfigError } from "./config/utils/loader.js";
import { createContainer } from "./container.js";
import { ConnectionManager } from "./connections/connection-manager.service.js";
import { ToolCatalogService } from "./catalog/tool-catalog.service.js";
import { ToriiConfigService } from "./config/torii-config.service.js";
import { runWithAgentPrincipal } from "./identity/agent-principal-context.js";
import { resolveBootAgentPrincipal } from "./identity/stub-agent-principal.js";
import { GatewayHttpServer } from "./http/gateway-http-server.service.js";
import { StructuredLoggerService } from "./logging/structured-logger.service.js";
import { isLinkCommand, runLinkCommand } from "./cli/link-command.js";

function resolvePort(): number {
  const raw = process.env.TORII_PORT ?? process.env.PORT ?? "3100";
  const port = Number.parseInt(raw, 10);
  if (!Number.isFinite(port) || port <= 0) {
    throw new Error(`Invalid gateway port: ${raw}`);
  }
  return port;
}

export async function startServer(): Promise<void> {
  const config = await loadConfig();
  const app = createContainer(config);
  const configService = app.resolve(ToriiConfigService);
  const connectionManager = app.resolve(ConnectionManager);
  const toolCatalog = app.resolve(ToolCatalogService);
  const gatewayHttpServer = app.resolve(GatewayHttpServer);
  const logger = app.resolve(StructuredLoggerService);

  logger.info("boot.config_loaded", {
    serverCount: configService.get().servers.length,
  });

  const bootPrincipal = resolveBootAgentPrincipal(config);

  await runWithAgentPrincipal(bootPrincipal, async () => {
    await connectionManager.connectAll();

    const connections = connectionManager.list();
    const connected = connections.filter(
      (connection) => connection.state === "connected",
    ).length;
    const failed = connections.filter(
      (connection) => connection.state === "failed",
    ).length;

    logger.info("boot.connections_ready", { connected, failed });

    const catalog = await toolCatalog.refresh();
    logger.info("boot.catalog_ready", { toolCount: catalog.length });
  });

  const gateway = await gatewayHttpServer.start({
    host: process.env.TORII_HOST ?? "127.0.0.1",
    port: resolvePort(),
  });
  logger.info("boot.listening", { url: gateway.url });
}

async function main(): Promise<void> {
  const commandArgs = process.argv.slice(2);

  if (isLinkCommand(commandArgs)) {
    const config = await loadConfig();
    const app = createContainer(config);
    await runLinkCommand(app, commandArgs.slice(1));
    return;
  }

  await startServer();
}

main().catch(reportConfigError);
