import { loadEnvForPackage } from "@keidai/shared/load-env";

loadEnvForPackage(import.meta.url);

import { createHttpFudaClient } from "@keidai/shared/clients";
import { getShaidenPersistence } from "./boot/persistence.js";
import { loadRuntimeConfig } from "./config/runtime-config.js";
import { ShaidenHttpServer } from "./http/shaiden-http-server.js";
import { defaultLogger } from "./logging/logger.js";
import { launchHarnessRun, resumeHarnessRun } from "./run/harness.js";
import {
  DEFAULT_PARKED_RECLAIM_INTERVAL_MS,
  DEFAULT_RUN_EVENT_POLL_INTERVAL_MS,
  resolveReplicaId,
} from "./run/run-lease.js";
import { resumeParkedHarnessRuns } from "./run/resume-parked-runs.js";

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
  // `loadRuntimeConfig` requires FUDA_URL; optional on the type for evals/tests.
  const fudaClient = createHttpFudaClient({ baseUrl: config.fudaBaseUrl! });
  const replicaId = resolveReplicaId();
  const harnessOptions = {
    replicaId,
    logger: defaultLogger,
    fudaClient,
  };

  const resumeParked = () =>
    resumeParkedHarnessRuns({
      runStore,
      resumeHarnessRun: (input) =>
        resumeHarnessRun({
          ...input,
          config,
          options: harnessOptions,
        }),
      logger: defaultLogger,
    });

  runStore.pollRemoteUpdates();
  const eventPoll = setInterval(() => {
    runStore.pollRemoteUpdates();
  }, DEFAULT_RUN_EVENT_POLL_INTERVAL_MS);
  eventPoll.unref();

  resumeParked();
  const reclaim = setInterval(resumeParked, DEFAULT_PARKED_RECLAIM_INTERVAL_MS);
  reclaim.unref();

  const httpServer = new ShaidenHttpServer({
    runStore,
    taskRepository,
    logger: defaultLogger,
    runtimeConfig: config,
    fudaClient,
    startTaskRun: ({ task, taskId }) =>
      launchHarnessRun({
        task,
        taskId,
        config,
        runStore,
        options: harnessOptions,
      }),
    resumeHarnessRun: (input) =>
      resumeHarnessRun({
        ...input,
        config,
        options: {
          ...harnessOptions,
          ...input.options,
        },
      }),
  });

  const http = await httpServer.start({
    host: config.httpHost,
    port: config.httpPort,
  });
  defaultLogger.info("boot.http_listening", {
    baseUrl: http.baseUrl,
    replicaId,
  });

  try {
    await waitForShutdown();
  } finally {
    clearInterval(eventPoll);
    clearInterval(reclaim);
    await http.close();
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  defaultLogger.error("boot.fatal", { error: message });
  process.exit(1);
});
