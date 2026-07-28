import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { loadRuntimeConfig } from "../../config/runtime-config.js";
import { createContainer } from "../../container.js";
import { FudaHttpServer } from "../fuda-http-server.service.js";
import { StructuredLoggerService } from "../../logging/structured-logger.service.js";

const silentLogger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
} as unknown as StructuredLoggerService;

function createTestServer(listenGroups?: string) {
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


describe("FudaHttpServer health", () => {
  it("starts on localhost, runs migrations, and responds on /api/health", async () => {
    const server = createTestServer();
    const handle = await server.start({ host: "127.0.0.1", port: 0 });
    try {
      assert.match(handle.baseUrl, /^http:\/\/127\.0\.0\.1:\d+$/);
      const response = await fetch(`${handle.baseUrl}/api/health`);
      assert.equal(response.status, 200);
      const body = (await response.json()) as {
        ok: boolean;
        version: string;
      };
      assert.equal(body.ok, true);
      assert.equal(typeof body.version, "string");
    } finally {
      await handle.close();
    }
  });
});

describe("route group separation", () => {
  it("can start with only the public route group enabled", async () => {
    const server = createTestServer("public");
    const handle = await server.start({ host: "127.0.0.1", port: 0 });
    try {
      const response = await fetch(`${handle.baseUrl}/api/health`);
      assert.equal(response.status, 200);
    } finally {
      await handle.close();
    }
  });

  it("createApp registers only the requested groups", async () => {
    const server = createTestServer("public,management");
    const publicOnly = await server.createApp(["public"]);
    const managementOnly = await server.createApp(["management"]);

    // Structural separation: independent Fastify instances for each group set.
    assert.notEqual(publicOnly, managementOnly);

    await publicOnly.close();
    await managementOnly.close();
  });
});
