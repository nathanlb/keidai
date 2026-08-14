import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { describe, it } from "node:test";
import { CLIENT_CAPABILITIES_META_KEY } from "@modelcontextprotocol/client";
import { MCP_TASKS_EXTENSION_ID } from "@keidai/shared";
import { connectToriiSession } from "../torii-client.js";

type JsonRpc = {
  jsonrpc: "2.0";
  id?: string | number;
  method?: string;
  params?: Record<string, unknown>;
};

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

const TASK_ID = "a".repeat(64);
const TIMESTAMPS = {
  createdAt: "2026-08-13T12:00:00.000Z",
  lastUpdatedAt: "2026-08-13T12:00:00.000Z",
};

async function startGatedToriiStub(): Promise<{
  url: string;
  calls: Array<{
    method: string;
    mcpMethod?: string;
    mcpName?: string;
    capabilities?: unknown;
    protocolVersion?: string;
  }>;
  close: () => Promise<void>;
}> {
  const calls: Array<{
    method: string;
    mcpMethod?: string;
    mcpName?: string;
    capabilities?: unknown;
    protocolVersion?: string;
  }> = [];
  let taskGets = 0;

  const tools = [
    {
      name: "gmail.create_draft",
      description: "Create a draft",
      inputSchema: { type: "object", properties: {} },
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

    const raw = await readBody(req);
    const message = JSON.parse(raw) as JsonRpc;
    const meta = message.params?._meta as Record<string, unknown> | undefined;
    calls.push({
      method: message.method ?? "",
      mcpMethod: req.headers["mcp-method"] as string | undefined,
      mcpName: req.headers["mcp-name"] as string | undefined,
      capabilities: meta?.[CLIENT_CAPABILITIES_META_KEY],
      protocolVersion: req.headers["mcp-protocol-version"] as string | undefined,
    });

    if (!("id" in message) || message.id === undefined) {
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
          capabilities: {
            tools: {},
            extensions: { [MCP_TASKS_EXTENSION_ID]: {} },
          },
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
      sendJson(res, 200, {
        jsonrpc: "2.0",
        id: message.id,
        result: {
          resultType: "task",
          taskId: TASK_ID,
          status: "working",
          ttlMs: 60_000,
          pollIntervalMs: 20,
          ...TIMESTAMPS,
        },
      });
      return;
    }

    if (message.method === "tasks/get") {
      taskGets += 1;
      sendJson(res, 200, {
        jsonrpc: "2.0",
        id: message.id,
        result:
          taskGets === 1
            ? {
                resultType: "complete",
                taskId: TASK_ID,
                status: "working",
                ttlMs: 60_000,
                pollIntervalMs: 20,
                ...TIMESTAMPS,
              }
            : {
                resultType: "complete",
                taskId: TASK_ID,
                status: "completed",
                ttlMs: 60_000,
                pollIntervalMs: 20,
                result: {
                  content: [{ type: "text", text: "draft created" }],
                  isError: false,
                },
                ...TIMESTAMPS,
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
    calls,
    close: () =>
      new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  };
}

describe("connectToriiSession task-augmented tools/call", () => {
  it("polls tasks/get and returns the terminal CallToolResult", async () => {
    const stub = await startGatedToriiStub();
    try {
      const session = await connectToriiSession(stub.url, {
        ensureToken: async () => "test-token",
      });
      try {
        const result = await session.callTool("gmail.create_draft", {
          subject: "hi",
        });
        assert.equal(result.isError, false);
        assert.equal(result.text, "draft created");
        assert.equal(result.approvalRequired, undefined);

        const callTools = stub.calls.filter((call) => call.method === "tools/call");
        assert.equal(callTools.length, 1);
        assert.equal(callTools[0]?.mcpMethod, "tools/call");
        assert.equal(callTools[0]?.mcpName, "gmail.create_draft");
        assert.equal(callTools[0]?.protocolVersion, "2026-07-28");
        assert.deepEqual(callTools[0]?.capabilities, {
          extensions: { [MCP_TASKS_EXTENSION_ID]: {} },
        });

        const gets = stub.calls.filter((call) => call.method === "tasks/get");
        assert.equal(gets.length, 2);
        assert.equal(gets[0]?.mcpMethod, "tasks/get");
        assert.equal(gets[0]?.mcpName, TASK_ID);
        assert.deepEqual(gets[0]?.capabilities, {
          extensions: { [MCP_TASKS_EXTENSION_ID]: {} },
        });
      } finally {
        await session.close();
      }
    } finally {
      await stub.close();
    }
  });
});
