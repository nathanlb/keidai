import { loadEnvForPackage } from "@keidai/shared/load-env";

loadEnvForPackage(import.meta.url);

import { createHttpFudaClient } from "@keidai/shared/clients";
import { getShaidenPersistence } from "./boot/persistence.js";
import { loadRuntimeConfig } from "./config/runtime-config.js";
import { PgOpenRouterCredentialRepository } from "./openrouter/pg-openrouter-credential-repository.js";
import { resolveOpenRouterApiKey } from "./openrouter/resolve-api-key.js";
import { ShaidenHttpServer } from "./http/shaiden-http-server.js";
import { defaultLogger } from "./logging/logger.js";
import { pollAssigneeMcpTask } from "./mcp/torii-client.js";
import { createRuntimeSandboxClient } from "./sandbox/sandbox-client.js";
import { sweepSandboxWorkspaces } from "./sandbox/sweep-sandbox-workspaces.js";
import {
  createToriiCredential,
  launchHarnessRun,
  resumeHarnessRun,
} from "./run/harness.js";
import { RunStopController } from "./run/run-stop-controller.js";
import {
  DEFAULT_PARKED_RECLAIM_INTERVAL_MS,
  DEFAULT_RUN_EVENT_POLL_INTERVAL_MS,
  resolveReplicaId,
} from "./run/run-lease.js";
import { resumeParkedHarnessRuns } from "./run/resume-parked-runs.js";
import { startScheduleDispatcher } from "./schedule/schedule-dispatcher.js";

function waitForShutdown(): Promise<void> {
  return new Promise((resolve) => {
    const onSignal = () => resolve();
    process.once("SIGINT", onSignal);
    process.once("SIGTERM", onSignal);
  });
}

async function main(): Promise<void> {
  const config = loadRuntimeConfig();
  const { runStore, taskRepository, pool } = await getShaidenPersistence();
  const openRouterCredentials = new PgOpenRouterCredentialRepository(pool);
  config.getOpenRouterApiKey = () =>
    resolveOpenRouterApiKey({
      credentials: openRouterCredentials,
      envFallback: config.openRouterApiKey,
    });
  // `loadRuntimeConfig` requires FUDA_URL; optional on the type for evals/tests.
  const fudaClient = createHttpFudaClient({ baseUrl: config.fudaBaseUrl! });
  const replicaId = resolveReplicaId();
  const runStopController = new RunStopController();
  const harnessOptions = {
    replicaId,
    logger: defaultLogger,
    fudaClient,
    stopController: runStopController,
  };

  const sandbox = config.sandboxUrl
    ? createRuntimeSandboxClient({
        baseUrl: config.sandboxUrl,
        fuda: fudaClient,
        getSubjectToken: config.getSubjectToken,
      })
    : undefined;

  const resumeParked = () =>
    resumeParkedHarnessRuns({
      runStore,
      replicaId,
      resumeHarnessRun: (input) =>
        resumeHarnessRun({
          ...input,
          config,
          options: harnessOptions,
        }),
      pollParkedTask: (parked, task) =>
        pollAssigneeMcpTask({
          toriiMcpUrl: config.toriiMcpUrl,
          credential: createToriiCredential(config, fudaClient, task.assignee),
          taskId: parked.mcpTaskId,
          pollIntervalMs: parked.pollIntervalMs,
        }),
      logger: defaultLogger,
      ...(sandbox ? { sandbox } : {}),
    });

  await runStore.pollRemoteUpdates();
  const eventPoll = setInterval(() => {
    void runStore.pollRemoteUpdates();
  }, DEFAULT_RUN_EVENT_POLL_INTERVAL_MS);
  eventPoll.unref();

  void resumeParked();
  const reclaim = setInterval(() => {
    void resumeParked();
  }, DEFAULT_PARKED_RECLAIM_INTERVAL_MS);
  reclaim.unref();

  if (sandbox) {
    const sweepSandbox = () =>
      sweepSandboxWorkspaces({
        sandbox,
        runStore,
        logger: defaultLogger,
      }).catch((error: unknown) => {
        defaultLogger.error("sandbox.sweep_failed", {
          error: error instanceof Error ? error.message : String(error),
        });
      });
    void sweepSandbox();
    const sandboxSweep = setInterval(() => {
      void sweepSandbox();
    }, DEFAULT_PARKED_RECLAIM_INTERVAL_MS);
    sandboxSweep.unref();
  }

  const schedule = startScheduleDispatcher({
    taskRepository,
    runStore,
    startTaskRun: ({ task, taskId }) =>
      launchHarnessRun({
        task,
        taskId,
        config,
        runStore,
        options: harnessOptions,
      }),
    logger: defaultLogger,
  });

  const httpServer = new ShaidenHttpServer({
    runStore,
    taskRepository,
    pool,
    logger: defaultLogger,
    runtimeConfig: config,
    fudaClient,
    runStopController,
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
    onScheduleChanged: () => schedule.notify(),
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
    schedule.stop();
    await http.close();
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  defaultLogger.error("boot.fatal", { error: message });
  process.exit(1);
});
