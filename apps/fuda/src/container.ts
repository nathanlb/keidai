import "reflect-metadata";
import { container, type DependencyContainer, Lifecycle } from "tsyringe";
import type { DatabaseSync } from "node:sqlite";
import type { RuntimeConfig } from "./config/runtime-config.js";
import { FudaConfigService } from "./config/fuda-config.service.js";
import { FudaHttpServer } from "./http/fuda-http-server.service.js";
import { StructuredLoggerService } from "./logging/structured-logger.service.js";
import { openFudaDatabase } from "./storage/fuda-sqlite.js";
import type { MigrationResult } from "./storage/migrate.js";

const SINGLETON = { lifecycle: Lifecycle.Singleton } as const;

export const FUDA_DATABASE = "FudaDatabase";

export interface FudaContainerResult {
  container: DependencyContainer;
  migrations: MigrationResult;
}

export function createContainer(config: RuntimeConfig): FudaContainerResult {
  const appContainer = container.createChildContainer();
  const { db, migrations } = openFudaDatabase(config.dbPath);

  appContainer.register(FudaConfigService, {
    useValue: new FudaConfigService(config),
  });
  appContainer.register(FUDA_DATABASE, { useValue: db });
  appContainer.register(
    StructuredLoggerService,
    { useClass: StructuredLoggerService },
    SINGLETON,
  );
  appContainer.register(
    FudaHttpServer,
    { useClass: FudaHttpServer },
    SINGLETON,
  );

  return { container: appContainer, migrations };
}

export function resolveFudaDatabase(
  appContainer: DependencyContainer,
): DatabaseSync {
  return appContainer.resolve<DatabaseSync>(FUDA_DATABASE);
}
