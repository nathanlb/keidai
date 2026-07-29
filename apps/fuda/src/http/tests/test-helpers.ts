import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { loadRuntimeConfig } from "../../config/runtime-config.js";
import { createContainer } from "../../container.js";
import { StructuredLoggerService } from "../../logging/structured-logger.service.js";
import { writeTempSigningKeyPem } from "../../signing/tests/test-helpers.js";
import { FudaHttpServer } from "../fuda-http-server.service.js";

const silentLogger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
} as unknown as StructuredLoggerService;

export { writeTempSigningKeyPem };

export function createTestServer(listenGroups?: string): FudaHttpServer {
  const dbDir = mkdtempSync(path.join(tmpdir(), "fuda-http-"));
  mkdirSync(dbDir, { recursive: true });
  const dbPath = path.join(dbDir, "fuda.db");
  const keyPath = writeTempSigningKeyPem("test");

  const config = loadRuntimeConfig({
    FUDA_DB_PATH: dbPath,
    FUDA_HOST: "127.0.0.1",
    FUDA_PORT: "3300",
    FUDA_SIGNING_KEYS: `test=${keyPath}`,
    FUDA_SIGNING_KID: "test",
    ...(listenGroups ? { FUDA_LISTEN_GROUPS: listenGroups } : {}),
  });
  const { container } = createContainer(config);
  container.register(StructuredLoggerService, { useValue: silentLogger });
  return container.resolve(FudaHttpServer);
}

export function createTestServerWithKeys(options: {
  listenGroups?: string;
  keys: Array<{ kid: string; path: string }>;
  signingKid: string;
}): {
  server: FudaHttpServer;
  container: ReturnType<typeof createContainer>["container"];
} {
  const dbPath = path.join(
    mkdtempSync(path.join(tmpdir(), "fuda-http-")),
    "fuda.db",
  );
  const signingKeys = options.keys
    .map((key) => `${key.kid}=${key.path}`)
    .join(",");

  const config = loadRuntimeConfig({
    FUDA_DB_PATH: dbPath,
    FUDA_HOST: "127.0.0.1",
    FUDA_PORT: "3300",
    FUDA_SIGNING_KEYS: signingKeys,
    FUDA_SIGNING_KID: options.signingKid,
    ...(options.listenGroups
      ? { FUDA_LISTEN_GROUPS: options.listenGroups }
      : {}),
  });
  const { container } = createContainer(config);
  container.register(StructuredLoggerService, { useValue: silentLogger });
  return {
    server: container.resolve(FudaHttpServer),
    container,
  };
}

export const sampleAgentBody = {
  slug: "newsletter",
  name: "Newsletter agent",
  ownerId: "owner-1",
  groups: ["editors"],
  persona: "You draft the weekly newsletter.",
};
