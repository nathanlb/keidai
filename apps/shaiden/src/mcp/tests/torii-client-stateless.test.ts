import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { describe, it } from "node:test";
import { connectToriiSession } from "../torii-client.js";

type JsonRpc =
  | { jsonrpc: "2.0"; id: string | number; method: string; params?: unknown }
  | { jsonrpc: "2.0"; method: string; params?: unknown };

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

/**
 * Minimal modern (2026-07-28) Streamable HTTP MCP stub: discover + list + call,
 * no session id. Restart clears in-memory generation so sticky sessions would fail.
 */
async function startModernToriiStub(): Promise<{
  url: string;
  generation: { value: number };
  close: () => Promise<void>;
}> {
  const generation = { value: 1 };
  const tools = [
    {
      name: "demo.echo",
      description: "echo",
      inputSchema: {
        type: "object",
        properties: { text: { type: "string" } },
      },
    },
  ];

  const server = createServer(async (req, res) => {
    if (req.method === "DELETE" || req.method === "GET") {
      res.writeHead(405).end();
      return;
    }
    if (req.method !== "POST") {
      res.writeHead(404).end();
      return;
    }

    // Stateless: reject sticky session headers.
    if (req.headers["mcp-session-id"]) {
      sendJson(res, 404, {
        jsonrpc: "2.0",
        id: null,
        error: { code: -32001, message: "session not found" },
      });
      return;
    }

    const raw = await readBody(req);
    const message = JSON.parse(raw) as JsonRpc;
    const gen = generation.value;

    if (!("id" in message)) {
      res.writeHead(202).end();
      return;
    }

    if (message.method === "server/discover") {
      sendJson(res, 200, {
        jsonrpc: "2.0",
        id: message.id,
        result: {
          resultType: "complete",
          supportedVersions: ["2026-07-28"],
          capabilities: { tools: {} },
          serverInfo: { name: "torii-stub", version: "0.0.0" },
          ttlMs: 60_000,
          cacheScope: "private",
        },
      });
      return;
    }

    if (message.method === "tools/list") {
      sendJson(res, 200, {
        jsonrpc: "2.0",
        id: message.id,
        result: {
          resultType: "complete",
          tools,
          ttlMs: 60_000,
          cacheScope: "private",
        },
      });
      return;
    }

    if (message.method === "tools/call") {
      const params = message.params as {
        name?: string;
        arguments?: { text?: string };
      };
      sendJson(res, 200, {
        jsonrpc: "2.0",
        id: message.id,
        result: {
          resultType: "complete",
          content: [
            {
              type: "text",
              text: `gen=${gen}:${params.arguments?.text ?? ""}`,
            },
          ],
          isError: false,
        },
      });
      return;
    }

    sendJson(res, 200, {
      jsonrpc: "2.0",
      id: message.id,
      error: { code: -32601, message: `Method not found: ${message.method}` },
    });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("expected TCP address");
  }

  return {
    url: `http://127.0.0.1:${address.port}/mcp`,
    generation,
    close: () =>
      new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  };
}

describe("connectToriiSession modern / per-request", () => {
  it("lists tools and survives a Torii restart between tool calls", async () => {
    const stub = await startModernToriiStub();
    try {
      const session = await connectToriiSession(stub.url, {
        ensureToken: async () => "test-token",
      });
      try {
        assert.equal(session.tools.length, 1);
        assert.equal(session.tools[0]?.name, "demo.echo");

        const first = await session.callTool("demo.echo", { text: "a" });
        assert.equal(first.isError, false);
        assert.match(first.text, /^gen=1:a$/);

        // Simulate Torii restart: bump generation and drop any sticky state.
        stub.generation.value = 2;

        const second = await session.callTool("demo.echo", { text: "b" });
        assert.equal(second.isError, false);
        assert.match(second.text, /^gen=2:b$/);
      } finally {
        await session.close();
      }
    } finally {
      await stub.close();
    }
  });
});
