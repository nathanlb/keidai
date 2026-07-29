import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { loadRuntimeConfig } from "../../config/runtime-config.js";
import { createContainer } from "../../container.js";
import { StructuredLoggerService } from "../../logging/structured-logger.service.js";
import { FudaHttpServer } from "../fuda-http-server.service.js";

const silentLogger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
} as unknown as StructuredLoggerService;

export function createTestServer(listenGroups?: string): FudaHttpServer {
  const dbPath = path.join(
    mkdtempSync(path.join(tmpdir(), "fuda-http-")),
    "fuda.db",
  );
  const config = loadRuntimeConfig({
    FUDA_DB_PATH: dbPath,
    FUDA_HOST: "127.0.0.1",
    FUDA_PORT: "3300",
    ...(listenGroups ? { FUDA_LISTEN_GROUPS: listenGroups } : {}),
  });
  const { container } = createContainer(config);
  container.register(StructuredLoggerService, { useValue: silentLogger });
  return container.resolve(FudaHttpServer);
}

export const sampleAgentBody = {
  slug: "newsletter",
  name: "Newsletter agent",
  ownerId: "owner-1",
  groups: ["editors"],
  persona: "You draft the weekly newsletter.",
};
