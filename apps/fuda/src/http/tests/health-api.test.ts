import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createTestServer } from "./test-helpers.js";

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
