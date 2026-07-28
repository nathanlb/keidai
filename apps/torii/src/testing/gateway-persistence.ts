import { mkdtempSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import path from "node:path";
import { SqliteOAuthClientRepository } from "../credentials/sqlite-oauth-client-repository.service.js";
import { SqlitePendingLinkStore } from "../credentials/sqlite-pending-link-store.service.js";
import { SqliteTokenRepository } from "../credentials/sqlite-token-repository.service.js";
import type { OAuthClientRepository } from "../credentials/types/oauth-client-repository.js";
import type { PendingOAuthLinkStore } from "../credentials/types/pending-oauth-link-store.js";
import type { TokenRepository } from "../credentials/types/token-repository.js";
import { openGatewayDatabase } from "../storage/gateway-sqlite.js";
import { SqliteTraceRepository } from "../trace/sqlite-trace-repository.service.js";
import type { TraceRepository } from "../trace/types/trace-repository.js";
import { MockOAuthClientRepository } from "./mocks/mock-oauth-client-repository.js";
import { MockPendingLinkStore } from "./mocks/mock-pending-link-store.js";
import { MockTokenRepository } from "./mocks/mock-token-repository.js";
import { MockTraceRepository } from "./mocks/mock-trace-repository.js";

export type TestGatewayBackend = "sqlite" | "memory";

export interface TestGatewayPersistence {
  tokenRepository: TokenRepository;
  clientRepository: OAuthClientRepository;
  pendingLinkStore: PendingOAuthLinkStore;
  traceRepository: TraceRepository;
  /** Present when backend is `"sqlite"`. */
  database?: DatabaseSync;
  /** Present when backend is `"sqlite"`. */
  databasePath?: string;
  close: () => void;
}

/**
 * Builds gateway persistence for tests.
 * Defaults to a temp SQLite database (production path).
 * Pass `"memory"` only for lightweight unit tests that do not need durability.
 */
export function createTestGatewayPersistence(
  backend: TestGatewayBackend = "sqlite",
): TestGatewayPersistence {
  if (backend === "memory") {
    return {
      tokenRepository: new MockTokenRepository(),
      clientRepository: new MockOAuthClientRepository(),
      pendingLinkStore: new MockPendingLinkStore(),
      traceRepository: new MockTraceRepository(),
      close: () => {},
    };
  }

  const databasePath = path.join(
    mkdtempSync(path.join(tmpdir(), "torii-gateway-test-")),
    "gateway.db",
  );
  const database = openGatewayDatabase(databasePath);
  return {
    database,
    databasePath,
    tokenRepository: new SqliteTokenRepository(database),
    clientRepository: new SqliteOAuthClientRepository(database),
    pendingLinkStore: new SqlitePendingLinkStore(database),
    traceRepository: new SqliteTraceRepository(database),
    close: () => {
      database.close();
    },
  };
}
