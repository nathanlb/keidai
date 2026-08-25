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
import { AGENT_REPOSITORY } from "./agents/types/agent-repository.js";
import { applyOperatorsFile } from "./owners/apply-operators-file.js";
import { OWNER_REPOSITORY } from "./owners/types/owner-repository.js";
import { BEARER_REPOSITORY } from "./bearers/types/bearer-repository.js";
import { ensurePlatformBearer } from "./bearers/ensure-platform-bearer.js";
import { discoverClusterOidcIssuer } from "./subject-token/utils/discover-cluster-oidc-issuer.js";
import type { SubjectTokenValidatorConfig } from "./subject-token/types/subject-token-validator-config.js";

function waitForShutdown(): Promise<void> {
  return new Promise((resolve) => {
    const onSignal = () => resolve();
    process.once("SIGINT", onSignal);
    process.once("SIGTERM", onSignal);
  });
}

async function resolveSubjectTokenValidatorConfig(
  config: SubjectTokenValidatorConfig | null,
): Promise<SubjectTokenValidatorConfig | null> {
  if (config?.kind !== "k8s_sa_oidc" || config.issuer) {
    return config;
  }

  const issuer = await discoverClusterOidcIssuer();
  return { ...config, issuer };
}

export async function startServer(): Promise<void> {
  const loaded = loadRuntimeConfig();
  const subjectTokenValidatorConfig = await resolveSubjectTokenValidatorConfig(
    loaded.subjectTokenValidatorConfig,
  );
  const { container: app, migrations } = await createContainer(
    loaded.config,
    subjectTokenValidatorConfig,
  );
  const logger = app.resolve(StructuredLoggerService);
  const httpServer = app.resolve(FudaHttpServer);

  logger.info("boot.config_loaded", {
    listenGroups: loaded.config.listenGroups,
    databaseUrl: loaded.config.databaseUrl,
  });
  if (
    subjectTokenValidatorConfig?.kind === "k8s_sa_oidc" &&
    loaded.subjectTokenValidatorConfig?.kind === "k8s_sa_oidc" &&
    !loaded.subjectTokenValidatorConfig.issuer
  ) {
    logger.info("boot.k8s_sa_oidc_issuer_discovered", {
      issuer: subjectTokenValidatorConfig.issuer,
    });
  }
  logger.info("boot.migrations_applied", {
    applied: migrations.applied,
    alreadyApplied: migrations.alreadyApplied,
  });

  const ownersReconcile = await applyOperatorsFile(
    app.resolve(OWNER_REPOSITORY),
    app.resolve(AGENT_REPOSITORY),
  );
  if (ownersReconcile) {
    logger.info("boot.operators_reconciled", {
      path: process.env.FUDA_OPERATORS_PATH,
      ...ownersReconcile,
    });
  }

  const platformBearer = await ensurePlatformBearer(
    app.resolve(BEARER_REPOSITORY),
    app.resolve(AGENT_REPOSITORY),
  );
  logger.info("boot.platform_bearer_ensured", {
    bearerCreated: platformBearer.bearerCreated,
    grantsEnsured: platformBearer.grantsEnsured,
  });

  const http = await httpServer.start();
  logger.info("boot.listening", {
    url: http.baseUrl,
    listenGroups: loaded.config.listenGroups,
  });

  try {
    await waitForShutdown();
  } finally {
    await http.close();
  }
}

async function main(): Promise<void> {
  await startServer();
}

main().catch(reportConfigError);
