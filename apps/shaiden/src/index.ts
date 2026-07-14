import { loadEnvForPackage } from "@keidai/shared/load-env";

loadEnvForPackage(import.meta.url);

import { getShaidenPersistence } from "./boot/persistence.js";
import { loadRuntimeConfig } from "./config/runtime-config.js";
import { ShaidenHttpServer } from "./http/shaiden-http-server.js";
import { defaultLogger } from "./logging/logger.js";
import { launchHarnessRun } from "./run/harness.js";

function waitForShutdown(): Promise<void> {
  return new Promise((resolve) => {
    const onSignal = () => resolve();
    process.once("SIGINT", onSignal);
    process.once("SIGTERM", onSignal);
  });
}

async function main(): Promise<void> {
  const config = loadRuntimeConfig();
  const { runStore, taskRepository } = getShaidenPersistence();

  const httpServer = new ShaidenHttpServer({
    runStore,
    taskRepository,
    logger: defaultLogger,
    agentId: config.agentId,
    startTaskRun: ({ task, taskId }) =>
      launchHarnessRun({ task, taskId, config, runStore }),
  });
  const http = await httpServer.start({
    host: config.httpHost,
    port: config.httpPort,
  });
  defaultLogger.info("boot.http_listening", {
    baseUrl: http.baseUrl,
    agentId: config.agentId,
  });

  try {
    await waitForShutdown();
  } finally {
    await http.close();
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  defaultLogger.error("boot.fatal", { error: message });
  process.exit(1);
});
