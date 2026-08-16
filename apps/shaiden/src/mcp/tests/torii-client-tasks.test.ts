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

async function startGatedToriiStub(options?: {
  failFirstTaskGet?: boolean;
  completeOnCall?: boolean;
}): Promise<{
  url: string;
  calls: Array<{
    method: string;
    mcpMethod?: string;
    mcpName?: string;
    capabilities?: unknown;
    protocolVersion?: string;
    authorization?: string;
  }>;
  close: () => Promise<void>;
}> {
  const calls: Array<{
    method: string;
    mcpMethod?: string;
    mcpName?: string;
    capabilities?: unknown;
    protocolVersion?: string;
    authorization?: string;
  }> = [];
  let taskGets = 0;
  let failedOnce = false;

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
      authorization: req.headers.authorization,
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
        result: options?.completeOnCall
          ? {
              resultType: "task",
              taskId: TASK_ID,
              status: "completed",
              ttlMs: 60_000,
              pollIntervalMs: 20,
              result: {
                content: [{ type: "text", text: "draft created" }],
                isError: false,
              },
              ...TIMESTAMPS,
            }
          : {
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
      if (options?.failFirstTaskGet && !failedOnce) {
        failedOnce = true;
        res.writeHead(502).end("bad gateway");
        return;
      }
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
  it("returns a park handle from tools/call without polling", async () => {
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
        assert.deepEqual(result.approvalRequired, {
          approvalId: TASK_ID,
          pollIntervalMs: 20,
        });

        const callTools = stub.calls.filter((call) => call.method === "tools/call");
        assert.equal(callTools.length, 1);
        assert.equal(callTools[0]?.mcpMethod, "tools/call");
        assert.equal(callTools[0]?.mcpName, "gmail.create_draft");
        assert.deepEqual(callTools[0]?.capabilities, {
          extensions: { [MCP_TASKS_EXTENSION_ID]: {} },
        });
        assert.equal(
          stub.calls.filter((call) => call.method === "tasks/get").length,
          0,
        );
      } finally {
        await session.close();
      }
    } finally {
      await stub.close();
    }
  });

  it("polls tasks/get until terminal and refreshes the JWT per poll", async () => {
    const stub = await startGatedToriiStub();
    let tokenCalls = 0;
    try {
      const session = await connectToriiSession(stub.url, {
        ensureToken: async () => {
          tokenCalls += 1;
          return `token-${tokenCalls}`;
        },
      });
      try {
        const mintedBeforePoll = tokenCalls;
        const result = await session.pollMcpTask(TASK_ID, 20);
        assert.equal(result.isError, false);
        assert.equal(result.text, "draft created");
        assert.equal(result.approvalRequired, undefined);

        const gets = stub.calls.filter((call) => call.method === "tasks/get");
        assert.equal(gets.length, 2);
        assert.equal(gets[0]?.mcpMethod, "tasks/get");
        assert.equal(gets[0]?.mcpName, TASK_ID);
        assert.deepEqual(gets[0]?.capabilities, {
          extensions: { [MCP_TASKS_EXTENSION_ID]: {} },
        });
        assert.ok(tokenCalls > mintedBeforePoll);
        assert.equal(gets[0]?.authorization, `Bearer token-${mintedBeforePoll + 1}`);
        assert.equal(gets[1]?.authorization, `Bearer token-${mintedBeforePoll + 2}`);
      } finally {
        await session.close();
      }
    } finally {
      await stub.close();
    }
  });

  it("maps an already-terminal tools/call without polling", async () => {
    const stub = await startGatedToriiStub({ completeOnCall: true });
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
        assert.equal(
          stub.calls.filter((call) => call.method === "tasks/get").length,
          0,
        );
      } finally {
        await session.close();
      }
    } finally {
      await stub.close();
    }
  });

  it("retries tasks/get after a transient Torii failure", async () => {
    const stub = await startGatedToriiStub({ failFirstTaskGet: true });
    try {
      const session = await connectToriiSession(stub.url, {
        ensureToken: async () => "test-token",
      });
      try {
        const result = await session.pollMcpTask(TASK_ID, 50);
        assert.equal(result.isError, false);
        assert.equal(result.text, "draft created");
      } finally {
        await session.close();
      }
    } finally {
      await stub.close();
    }
  });
});
