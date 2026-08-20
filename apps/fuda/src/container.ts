import "reflect-metadata";
import { container, type DependencyContainer, Lifecycle } from "tsyringe";
import type { Pool } from "@keidai/postgres";
import type { RuntimeConfig } from "./config/runtime-config.js";
import { FudaConfigService } from "./config/fuda-config.service.js";
import { AgentDefinitionApiController } from "./agents/agent-definition-api.controller.js";
import { AgentsManagementApiController } from "./agents/agents-management-api.controller.js";
import { PgAgentRepository } from "./agents/pg-agent-repository.js";
import { AGENT_REPOSITORY } from "./agents/types/agent-repository.js";
import { BearersManagementApiController } from "./bearers/bearers-management-api.controller.js";
import { PgBearerRepository } from "./bearers/pg-bearer-repository.js";
import { BEARER_REPOSITORY } from "./bearers/types/bearer-repository.js";
import { FudaHttpServer } from "./http/fuda-http-server.service.js";
import { StructuredLoggerService } from "./logging/structured-logger.service.js";
import { JwksApiController } from "./signing/jwks-api.controller.js";
import { SigningKeyService } from "./signing/signing-key.service.js";
import type { SubjectTokenValidatorConfig } from "./subject-token/types/subject-token-validator-config.js";
import { SUBJECT_TOKEN_VALIDATOR } from "./subject-token/types/subject-token-validator.js";
import { createSubjectTokenValidator } from "./subject-token/utils/create-subject-token-validator.js";
import { PgOwnerRepository } from "./owners/pg-owner-repository.js";
import { OWNER_REPOSITORY } from "./owners/types/owner-repository.js";
import {
  FUDA_DATABASE,
  openFudaDatabase,
} from "./storage/fuda-postgres.js";
import { TokenExchangeApiController } from "./token-exchange/token-exchange-api.controller.js";
import type { MigrationResult } from "@keidai/postgres";

export { FUDA_DATABASE };

const SINGLETON = { lifecycle: Lifecycle.Singleton } as const;

export interface FudaContainerResult {
  container: DependencyContainer;
  migrations: MigrationResult;
}

export interface CreateContainerOptions {
  pool?: Pool;
}

/**
 * @param subjectTokenValidatorConfig One-shot wiring from loadRuntimeConfig;
 *   subject credentials stay off RuntimeConfig.
 */
export async function createContainer(
  config: RuntimeConfig,
  subjectTokenValidatorConfig: SubjectTokenValidatorConfig | null = null,
  options: CreateContainerOptions = {},
): Promise<FudaContainerResult> {
  const appContainer = container.createChildContainer();
  const { pool, migrations } = await openFudaDatabase(
    config.databaseUrl,
    options.pool,
  );
  const signingKeys = new SigningKeyService(config.signingKeys);

  appContainer.register(FudaConfigService, {
    useValue: new FudaConfigService(config),
  });
  appContainer.register(FUDA_DATABASE, { useValue: pool });
  appContainer.register(SigningKeyService, { useValue: signingKeys });
  if (subjectTokenValidatorConfig) {
    appContainer.register(SUBJECT_TOKEN_VALIDATOR, {
      useValue: createSubjectTokenValidator(subjectTokenValidatorConfig),
    });
  }
  appContainer.register(
    StructuredLoggerService,
    { useClass: StructuredLoggerService },
    SINGLETON,
  );
  appContainer.register(
    JwksApiController,
    { useClass: JwksApiController },
    SINGLETON,
  );
  appContainer.register(
    AgentsManagementApiController,
    { useClass: AgentsManagementApiController },
    SINGLETON,
  );
  appContainer.register(
    BearersManagementApiController,
    { useClass: BearersManagementApiController },
    SINGLETON,
  );
  appContainer.register(
    AgentDefinitionApiController,
    { useClass: AgentDefinitionApiController },
    SINGLETON,
  );
  appContainer.register(
    TokenExchangeApiController,
    { useClass: TokenExchangeApiController },
    SINGLETON,
  );
  appContainer.register(
    FudaHttpServer,
    { useClass: FudaHttpServer },
    SINGLETON,
  );

  let agentRepository: PgAgentRepository | undefined;
  let bearerRepository: PgBearerRepository | undefined;
  let ownerRepository: PgOwnerRepository | undefined;

  appContainer.register(OWNER_REPOSITORY, {
    useFactory: () => {
      ownerRepository ??= new PgOwnerRepository(
        appContainer.resolve<Pool>(FUDA_DATABASE),
      );
      return ownerRepository;
    },
  });
  appContainer.register(AGENT_REPOSITORY, {
    useFactory: () => {
      agentRepository ??= new PgAgentRepository(
        appContainer.resolve<Pool>(FUDA_DATABASE),
      );
      return agentRepository;
    },
  });
  appContainer.register(BEARER_REPOSITORY, {
    useFactory: () => {
      bearerRepository ??= new PgBearerRepository(
        appContainer.resolve<Pool>(FUDA_DATABASE),
      );
      return bearerRepository;
    },
  });

  return { container: appContainer, migrations };
}

export function resolveFudaDatabase(appContainer: DependencyContainer): Pool {
  return appContainer.resolve<Pool>(FUDA_DATABASE);
}
