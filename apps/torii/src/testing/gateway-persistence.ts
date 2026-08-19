import {
  createIsolatedSchema,
  resolveTestDatabaseUrl,
  type IsolatedSchema,
  type Pool,
} from "@keidai/postgres";
import { PgOAuthClientRepository } from "../credentials/pg-oauth-client-repository.service.js";
import { PgPendingLinkStore } from "../credentials/pg-pending-link-store.service.js";
import { PgTokenRepository } from "../credentials/pg-token-repository.service.js";
import type { OAuthClientRepository } from "../credentials/types/oauth-client-repository.js";
import type { PendingOAuthLinkStore } from "../credentials/types/pending-oauth-link-store.js";
import type { TokenRepository } from "../credentials/types/token-repository.js";
import { ApprovalStoreService } from "../policy/approval-store.service.js";
import { openGatewayDatabase } from "../storage/gateway-postgres.js";
import { TaskStoreService } from "../tasks/task-store.service.js";
import { PgTraceRepository } from "../trace/pg-trace-repository.service.js";
import type { TraceRepository } from "../trace/types/trace-repository.js";
import { MockOAuthClientRepository } from "./mocks/mock-oauth-client-repository.js";
import { MockPendingLinkStore } from "./mocks/mock-pending-link-store.js";
import { MockTokenRepository } from "./mocks/mock-token-repository.js";
import { MockTraceRepository } from "./mocks/mock-trace-repository.js";

export type TestGatewayBackend = "postgres" | "memory";

export interface TestGatewayPersistence {
  tokenRepository: TokenRepository;
  clientRepository: OAuthClientRepository;
  pendingLinkStore: PendingOAuthLinkStore;
  traceRepository: TraceRepository;
  /** Present when backend is `"postgres"`. */
  approvalStore?: ApprovalStoreService;
  /** Present when backend is `"postgres"`. */
  taskStore?: TaskStoreService;
  /** Present when backend is `"postgres"`. */
  pool?: Pool;
  /** Present when backend is `"postgres"`. */
  isolated?: IsolatedSchema;
  close: () => Promise<void>;
}

/**
 * Builds gateway persistence for tests.
 * Defaults to an isolated Postgres schema (production path).
 * Pass `"memory"` only for lightweight unit tests that do not need durability.
 */
export async function createTestGatewayPersistence(
  backend: TestGatewayBackend = "postgres",
): Promise<TestGatewayPersistence> {
  if (backend === "memory") {
    return {
      tokenRepository: new MockTokenRepository(),
      clientRepository: new MockOAuthClientRepository(),
      pendingLinkStore: new MockPendingLinkStore(),
      traceRepository: new MockTraceRepository(),
      close: async () => {},
    };
  }

  const isolated = await createIsolatedSchema();
  const { pool } = await openGatewayDatabase(
    resolveTestDatabaseUrl(),
    isolated.pool,
  );
  return {
    pool,
    isolated,
    tokenRepository: new PgTokenRepository(pool),
    clientRepository: new PgOAuthClientRepository(pool),
    pendingLinkStore: new PgPendingLinkStore(pool),
    traceRepository: new PgTraceRepository(pool),
    approvalStore: new ApprovalStoreService(pool),
    taskStore: new TaskStoreService(pool),
    close: () => isolated.close(),
  };
}
