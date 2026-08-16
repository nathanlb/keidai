import assert from "node:assert/strict";
import { createServer } from "node:http";
import { describe, it } from "node:test";
import {
  CLIENT_CAPABILITIES_META_KEY,
  CLIENT_INFO_META_KEY,
  PROTOCOL_VERSION_META_KEY,
} from "@modelcontextprotocol/client";
import { MCP_TASKS_EXTENSION_ID } from "../mcp-tasks.js";
import {
  MCP_PROTOCOL_VERSION,
  McpJsonRpcError,
  postMcpJsonRpc,
} from "../mcp-jsonrpc.js";

const CLIENT_INFO = { name: "test-client", version: "1.0.0" } as const;
const CLIENT_CAPABILITIES = {
  extensions: { [MCP_TASKS_EXTENSION_ID]: {} },
} as const;

interface Reply {
  status?: number;
  contentType?: string;
  body: string;
}

interface Stub {
  url: string;
  requests: Array<{ body: Record<string, unknown>; headers: Headers }>;
  close: () => Promise<void>;
}

/** `reply` receives the request id so stubs can echo or deliberately mismatch. */
async function startStub(
  reply: (id: unknown) => Reply,
): Promise<Stub> {
  const requests: Stub["requests"] = [];
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(Buffer.from(chunk));
    }
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<
      string,
      unknown
    >;
    const headers = new Headers();
    for (const [name, value] of Object.entries(req.headers)) {
      if (typeof value === "string") {
        headers.set(name, value);
      }
    }
    requests.push({ body, headers });

    const payload = reply(body.id);
    res
      .writeHead(payload.status ?? 200, {
        "content-type": payload.contentType ?? "application/json",
      })
      .end(payload.body);
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("expected a TCP address");
  }

  return {
    url: `http://127.0.0.1:${address.port}/mcp`,
    requests,
    close: () =>
      new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  };
}

function jsonResult(id: unknown, result: Record<string, unknown>): Reply {
  return { body: JSON.stringify({ jsonrpc: "2.0", id, result }) };
}

function post(stub: Stub, method: string, params?: Record<string, unknown>) {
  return postMcpJsonRpc({
    url: stub.url,
    method,
    params,
    clientInfo: CLIENT_INFO,
    clientCapabilities: CLIENT_CAPABILITIES,
    protocolVersion: MCP_PROTOCOL_VERSION,
  });
}

describe("postMcpJsonRpc", () => {
  it("stamps client info, capabilities, and protocol version on _meta", async () => {
    const stub = await startStub((id) =>
      jsonResult(id, { resultType: "complete", content: [] }),
    );

    try {
      const result = await post(stub, "tools/call", {
        name: "echo",
        arguments: {},
      });
      assert.equal(result.resultType, "complete");

      const params = stub.requests[0]?.body.params as Record<string, unknown>;
      const meta = params._meta as Record<string, unknown>;
      assert.equal(meta[PROTOCOL_VERSION_META_KEY], MCP_PROTOCOL_VERSION);
      assert.deepEqual(meta[CLIENT_INFO_META_KEY], CLIENT_INFO);
      assert.deepEqual(meta[CLIENT_CAPABILITIES_META_KEY], CLIENT_CAPABILITIES);
      assert.equal(stub.requests[0]?.headers.get("mcp-method"), "tools/call");
      assert.equal(stub.requests[0]?.headers.get("mcp-name"), "echo");
    } finally {
      await stub.close();
    }
  });

  it("preserves caller-supplied _meta keys", async () => {
    const stub = await startStub((id) => jsonResult(id, { resultType: "complete" }));

    try {
      await post(stub, "tools/call", {
        name: "echo",
        _meta: { "io.keidai/custom": "keep-me" },
      });
      const params = stub.requests[0]?.body.params as Record<string, unknown>;
      const meta = params._meta as Record<string, unknown>;
      assert.equal(meta["io.keidai/custom"], "keep-me");
      assert.deepEqual(meta[CLIENT_INFO_META_KEY], CLIENT_INFO);
    } finally {
      await stub.close();
    }
  });

  it("uses taskId as Mcp-Name for tasks/*", async () => {
    const stub = await startStub((id) =>
      jsonResult(id, { resultType: "complete", taskId: "abc", status: "working" }),
    );

    try {
      await post(stub, "tasks/get", { taskId: "abc" });
      assert.equal(stub.requests[0]?.headers.get("mcp-name"), "abc");
    } finally {
      await stub.close();
    }
  });

  it("throws McpJsonRpcError on a JSON-RPC error", async () => {
    const stub = await startStub((id) => ({
      body: JSON.stringify({
        jsonrpc: "2.0",
        id,
        error: { code: -32602, message: "Task not found", data: { taskId: "x" } },
      }),
    }));

    try {
      await assert.rejects(
        () => post(stub, "tasks/get", { taskId: "missing" }),
        (error: unknown) => {
          assert.ok(error instanceof McpJsonRpcError);
          assert.equal(error.code, -32602);
          assert.match(error.message, /Task not found/);
          assert.deepEqual(error.data, { taskId: "x" });
          return true;
        },
      );
    } finally {
      await stub.close();
    }
  });

  it("reads the response from an SSE stream", async () => {
    const stub = await startStub((id) => ({
      contentType: "text/event-stream",
      body: `event: message\ndata: ${JSON.stringify({
        jsonrpc: "2.0",
        id,
        result: { resultType: "complete", content: [] },
      })}\n\n`,
    }));

    try {
      const result = await post(stub, "tools/call", { name: "echo" });
      assert.equal(result.resultType, "complete");
    } finally {
      await stub.close();
    }
  });

  it("skips notifications that precede the response on an SSE stream", async () => {
    const stub = await startStub((id) => {
      const notification = JSON.stringify({
        jsonrpc: "2.0",
        method: "notifications/progress",
        params: { progress: 1 },
      });
      const response = JSON.stringify({
        jsonrpc: "2.0",
        id,
        result: { resultType: "complete", content: [{ type: "text", text: "ok" }] },
      });
      return {
        contentType: "text/event-stream",
        body: `: keep-alive\n\ndata: ${notification}\n\ndata: ${response}\n\n`,
      };
    });

    try {
      const result = await post(stub, "tools/call", { name: "echo" });
      assert.equal(result.resultType, "complete");
      assert.deepEqual(result.content, [{ type: "text", text: "ok" }]);
    } finally {
      await stub.close();
    }
  });

  it("skips a server-initiated request that precedes the response", async () => {
    const stub = await startStub((id) => {
      const serverRequest = JSON.stringify({
        jsonrpc: "2.0",
        id: "server-1",
        method: "elicitation/create",
        params: {},
      });
      const response = JSON.stringify({
        jsonrpc: "2.0",
        id,
        result: { resultType: "complete", content: [] },
      });
      return {
        contentType: "text/event-stream",
        body: `data: ${serverRequest}\n\ndata: ${response}\n\n`,
      };
    });

    try {
      const result = await post(stub, "tools/call", { name: "echo" });
      assert.equal(result.resultType, "complete");
    } finally {
      await stub.close();
    }
  });

  it("joins multi-line SSE data payloads", async () => {
    const stub = await startStub((id) => {
      const response = JSON.stringify(
        { jsonrpc: "2.0", id, result: { resultType: "complete" } },
        null,
        2,
      );
      const lines = response
        .split("\n")
        .map((line) => `data: ${line}`)
        .join("\n");
      return { contentType: "text/event-stream", body: `${lines}\n\n` };
    });

    try {
      const result = await post(stub, "tools/call", { name: "echo" });
      assert.equal(result.resultType, "complete");
    } finally {
      await stub.close();
    }
  });

  it("rejects a response carrying a different JSON-RPC id", async () => {
    const stub = await startStub(() =>
      jsonResult("some-other-request", { resultType: "complete" }),
    );

    try {
      await assert.rejects(
        () => post(stub, "tools/call", { name: "echo" }),
        (error: unknown) => {
          assert.ok(error instanceof Error);
          assert.ok(!(error instanceof McpJsonRpcError));
          assert.match(error.message, /without a JSON-RPC response for id/);
          return true;
        },
      );
    } finally {
      await stub.close();
    }
  });

  it("reports the status and a bounded body snippet for a non-JSON error page", async () => {
    const stub = await startStub(() => ({
      status: 502,
      contentType: "text/html",
      body: `<html><body>${"bad gateway ".repeat(80)}</body></html>`,
    }));

    try {
      await assert.rejects(
        () => post(stub, "tasks/get", { taskId: "abc" }),
        (error: unknown) => {
          assert.ok(error instanceof Error);
          assert.match(error.message, /MCP tasks\/get returned 502/);
          assert.ok(error.message.length < 400);
          return true;
        },
      );
    } finally {
      await stub.close();
    }
  });

  it("surfaces a JSON-RPC error sent with a non-2xx status", async () => {
    const stub = await startStub((id) => ({
      status: 500,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id,
        error: { code: -32603, message: "Internal error" },
      }),
    }));

    try {
      await assert.rejects(
        () => post(stub, "tasks/get", { taskId: "abc" }),
        (error: unknown) => {
          assert.ok(error instanceof McpJsonRpcError);
          assert.equal(error.code, -32603);
          return true;
        },
      );
    } finally {
      await stub.close();
    }
  });

  it("rejects a result payload delivered with a non-2xx status", async () => {
    const stub = await startStub((id) => ({
      status: 503,
      body: JSON.stringify({ jsonrpc: "2.0", id, result: { resultType: "complete" } }),
    }));

    try {
      await assert.rejects(
        () => post(stub, "tools/call", { name: "echo" }),
        (error: unknown) => {
          assert.ok(error instanceof Error);
          assert.match(error.message, /returned 503 with a result payload/);
          return true;
        },
      );
    } finally {
      await stub.close();
    }
  });

  it("rejects an empty body", async () => {
    const stub = await startStub(() => ({ status: 204, body: "" }));

    try {
      await assert.rejects(
        () => post(stub, "tools/call", { name: "echo" }),
        (error: unknown) => {
          assert.ok(error instanceof Error);
          assert.match(error.message, /empty body/);
          return true;
        },
      );
    } finally {
      await stub.close();
    }
  });
});
