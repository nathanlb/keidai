import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import type { Logger } from "@keidai/shared";
import { bffServiceTokenAuthorizationHeader } from "@keidai/shared/bff-service-token";
import { resumeHarnessRun } from "../../run/harness.js";
import type { RuntimeConfig } from "../../config/runtime-config.js";
import { ShaidenHttpServer } from "../shaiden-http-server.js";
import { createTestPersistence } from "../../testing/persistence.js";

const TOKEN = "shaiden-bff-service-token";

const silentLogger: Logger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
};

const testRuntimeConfig: RuntimeConfig = {
  toriiMcpUrl: "http://127.0.0.1:3100/mcp",
  getSubjectToken: () => "test-bearer",
  openRouterApiKey: "test-openrouter",
  modelId: "google/gemini-2.5-flash",
  httpHost: "127.0.0.1",
  httpPort: 3200,
};

async function createServer() {
  const persistence = await createTestPersistence();
  const server = new ShaidenHttpServer({
    runStore: persistence.runStore,
    taskRepository: persistence.taskRepository,
    pool: persistence.pool,
    logger: silentLogger,
    runtimeConfig: testRuntimeConfig,
    resumeHarnessRun: (input) =>
      resumeHarnessRun({
        ...input,
        config: testRuntimeConfig,
        options: { logger: silentLogger },
      }),
    startTaskRun: async () => {
      throw new Error("not used");
    },
  });
  const start = server.start.bind(server);
  server.start = async (options) => {
    const handle = await start(options);
    return {
      baseUrl: handle.baseUrl,
      close: async () => {
        await handle.close();
        await persistence.close();
      },
    };
  };
  return server;
}

describe("Shaiden BFF service token gate", () => {
  afterEach(() => {
    delete process.env.BFF_SERVICE_TOKEN;
    process.env.BFF_SERVICE_TOKEN_DISABLED = "true";
  });

  it("rejects management API calls without a valid token", async () => {
    delete process.env.BFF_SERVICE_TOKEN_DISABLED;
    process.env.BFF_SERVICE_TOKEN = TOKEN;
    const handle = await (await createServer()).start({ host: "127.0.0.1", port: 0 });

    try {
      const unauthorized = await fetch(`${handle.baseUrl}/api/tasks`);
      assert.equal(unauthorized.status, 401);

      const wrong = await fetch(`${handle.baseUrl}/api/tasks`, {
        headers: {
          authorization: bffServiceTokenAuthorizationHeader("wrong"),
        },
      });
      assert.equal(wrong.status, 401);

      const ok = await fetch(`${handle.baseUrl}/api/tasks`, {
        headers: {
          authorization: bffServiceTokenAuthorizationHeader(TOKEN),
        },
      });
      assert.equal(ok.status, 200);

      const health = await fetch(`${handle.baseUrl}/api/health`);
      assert.equal(health.status, 200);
    } finally {
      await handle.close();
    }
  });
});
