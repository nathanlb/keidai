import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Logger, Task } from "@keidai/shared";
import type { RuntimeConfig } from "../../config/runtime-config.js";
import { ShaidenHttpServer } from "../../http/shaiden-http-server.js";
import { createTestPersistence } from "../../testing/persistence.js";

process.env.BFF_SERVICE_TOKEN_DISABLED ??= "true";
process.env.SHAIDEN_SECRET_KEY ??= "shaiden-test-secret-key-do-not-use";

const silentLogger: Logger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
};

const runtimeConfig: RuntimeConfig = {
  toriiMcpUrl: "http://127.0.0.1:3100/mcp",
  getSubjectToken: () => "test-bearer",
  openRouterApiKey: "sk-or-env-fallback-key-value",
  modelId: "deepseek/deepseek-v4.1-flash",
  httpHost: "127.0.0.1",
  httpPort: 3200,
};

const sampleTask: Task = {
  goal: "Draft a note.",
  trigger: { type: "now" },
  assignee: "agent-1",
};

describe("OpenRouter configuration API", () => {
  it("stores a key as a hint, never returns the secret, and lists tool-use models", async () => {
    const persistence = await createTestPersistence();
    const seenKeys: string[] = [];
    const server = new ShaidenHttpServer({
      runStore: persistence.runStore,
      taskRepository: persistence.taskRepository,
      pool: persistence.pool,
      logger: silentLogger,
      runtimeConfig,
      fetchOpenRouterModels: async (apiKey) => {
        seenKeys.push(apiKey);
        return {
          data: [
            {
              id: "openai/gpt-4o",
              name: "GPT-4o",
              supported_parameters: ["tools"],
            },
            {
              id: "meta/llama",
              name: "Llama",
              supported_parameters: ["temperature"],
            },
          ],
        };
      },
      startTaskRun: async () => {
        throw new Error("unused");
      },
      resumeHarnessRun: async () => {
        throw new Error("unused");
      },
    });
    const handle = await server.start({ host: "127.0.0.1", port: 0 });
    const secret = "sk-or-v1-ui-managed-secret-key";
    try {
      const before = await fetch(`${handle.baseUrl}/api/openrouter/credential`);
      assert.equal(before.status, 200);
      assert.deepEqual(await before.json(), {
        configured: true,
        hint: "…alue",
        source: "environment",
      });

      const saved = await fetch(`${handle.baseUrl}/api/openrouter/credential`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ apiKey: secret }),
      });
      assert.equal(saved.status, 200);
      const savedBody = (await saved.json()) as {
        configured: boolean;
        hint: string;
        source: string;
      };
      assert.deepEqual(savedBody, {
        configured: true,
        hint: "…-key",
        source: "stored",
      });
      assert.equal(JSON.stringify(savedBody).includes(secret), false);

      const models = await fetch(`${handle.baseUrl}/api/openrouter/models`);
      assert.equal(models.status, 200);
      assert.deepEqual(await models.json(), {
        models: [{ id: "openai/gpt-4o", name: "GPT-4o" }],
      });
      assert.deepEqual(seenKeys, [secret]);

      const cleared = await fetch(
        `${handle.baseUrl}/api/openrouter/credential`,
        {
          method: "DELETE",
        },
      );
      assert.equal(cleared.status, 200);
      assert.deepEqual(await cleared.json(), {
        configured: true,
        hint: "…alue",
        source: "environment",
      });
    } finally {
      await handle.close();
      await persistence.close();
    }
  });

  it("persists a task model override and can clear it", async () => {
    const persistence = await createTestPersistence();
    const server = new ShaidenHttpServer({
      runStore: persistence.runStore,
      taskRepository: persistence.taskRepository,
      pool: persistence.pool,
      logger: silentLogger,
      runtimeConfig: { ...runtimeConfig, openRouterApiKey: undefined },
      startTaskRun: async () => {
        throw new Error("unused");
      },
      resumeHarnessRun: async () => {
        throw new Error("unused");
      },
    });
    const handle = await server.start({ host: "127.0.0.1", port: 0 });
    try {
      const missing = await fetch(`${handle.baseUrl}/api/openrouter/models`);
      assert.equal(missing.status, 409);

      const created = await fetch(`${handle.baseUrl}/api/tasks`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...sampleTask,
          modelId: "openai/gpt-4o",
        }),
      });
      assert.equal(created.status, 201);
      const { task } = (await created.json()) as {
        task: { id: string; modelId?: string };
      };
      assert.equal(task.modelId, "openai/gpt-4o");

      const cleared = await fetch(`${handle.baseUrl}/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ modelId: null }),
      });
      assert.equal(cleared.status, 200);
      const updated = (await cleared.json()) as { task: { modelId?: string } };
      assert.equal(updated.task.modelId, undefined);
    } finally {
      await handle.close();
      await persistence.close();
    }
  });
});
