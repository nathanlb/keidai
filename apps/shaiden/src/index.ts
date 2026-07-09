import { loadEnvForPackage } from "@keidai/shared/load-env";
import { taskSchema } from "@keidai/shared";

loadEnvForPackage(import.meta.url);

import { BOOT_TASK } from "./config/boot-task.js";
import { loadRuntimeConfig } from "./config/runtime-config.js";
import { ShaidenHttpServer } from "./http/shaiden-http-server.js";
import { defaultLogger } from "./logging/logger.js";
import { startHarnessRun } from "./run/harness.js";
import { runStore } from "./runs/run-store.js";

function previewOf(value: string, maxLength = 200): string {
  const flattened = value.replace(/\s+/g, " ").trim();
  return flattened.length > maxLength
    ? `${flattened.slice(0, maxLength)}…`
    : flattened;
}

function waitForShutdown(): Promise<void> {
  return new Promise((resolve) => {
    const onSignal = () => resolve();
    process.once("SIGINT", onSignal);
    process.once("SIGTERM", onSignal);
  });
}

async function main(): Promise<void> {
  const config = loadRuntimeConfig();
  const task = taskSchema.parse(BOOT_TASK);

  if (task.assignee !== config.agentId) {
    throw new Error(
      `Task assignee (${task.assignee}) must match agent id (${config.agentId})`,
    );
  }

  const httpServer = new ShaidenHttpServer(runStore, defaultLogger);
  const http = await httpServer.start({
    host: config.httpHost,
    port: config.httpPort,
  });
  defaultLogger.info("boot.http_listening", {
    baseUrl: http.baseUrl,
  });

  defaultLogger.info("boot.task_loaded", {
    assignee: task.assignee,
    agentId: config.agentId,
    goal: previewOf(task.goal),
  });

  try {
    await startHarnessRun(task, config);
    defaultLogger.info("boot.run_finished_keeping_http", {
      baseUrl: http.baseUrl,
    });
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
