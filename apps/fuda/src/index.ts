#!/usr/bin/env node
import { loadEnvForPackage } from "@keidai/shared/load-env";

loadEnvForPackage(import.meta.url);

import "reflect-metadata";
import { createContainer } from "./container.js";
import {
  loadRuntimeConfig,
  reportConfigError,
} from "./config/runtime-config.js";
import { FudaHttpServer } from "./http/fuda-http-server.service.js";
import { StructuredLoggerService } from "./logging/structured-logger.service.js";
import { runSeedCommand } from "./seed/run-seed-command.js";

function waitForShutdown(): Promise<void> {
  return new Promise((resolve) => {
    const onSignal = () => resolve();
    process.once("SIGINT", onSignal);
    process.once("SIGTERM", onSignal);
  });
}

export async function startServer(): Promise<void> {
  const { config, subjectTokenValidatorConfig } = loadRuntimeConfig();
  const { container: app, migrations } = createContainer(
    config,
    subjectTokenValidatorConfig,
  );
  const logger = app.resolve(StructuredLoggerService);
  const httpServer = app.resolve(FudaHttpServer);

  logger.info("boot.config_loaded", {
    listenGroups: config.listenGroups,
    dbPath: config.dbPath,
  });
  logger.info("boot.migrations_applied", {
    applied: migrations.applied,
    alreadyApplied: migrations.alreadyApplied,
  });

  const http = await httpServer.start();
  logger.info("boot.listening", {
    url: http.baseUrl,
    listenGroups: config.listenGroups,
  });

  try {
    await waitForShutdown();
  } finally {
    await http.close();
  }
}

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);
  if (command === "seed") {
    await runSeedCommand(rest);
    return;
  }
  if (command !== undefined) {
    console.error(`Unknown command: ${command}`);
    console.error("Usage: fuda | fuda seed <file.yaml>");
    process.exit(1);
  }
  await startServer();
}

main().catch(reportConfigError);
