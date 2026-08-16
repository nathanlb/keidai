import assert from "node:assert/strict";
import { createServer } from "node:http";
import { describe, it } from "node:test";
import {
  CLIENT_CAPABILITIES_META_KEY,
  CLIENT_INFO_META_KEY,
  PROTOCOL_VERSION_META_KEY,
} from "@modelcontextprotocol/client";
import { MCP_TASKS_EXTENSION_ID } from "@keidai/shared";
import { MCP_PROTOCOL_VERSION } from "@keidai/shared/mcp-jsonrpc";
import {
  TORII_OUTBOUND_CLIENT_CAPABILITIES,
  TORII_OUTBOUND_CLIENT_INFO,
  postBackendMcpJsonRpc,
} from "../post-backend-mcp.js";

function listen(
  onRequest: (body: unknown, headers: Headers) => void,
): Promise<{ url: string; close: () => Promise<void> }> {
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(Buffer.from(chunk));
    }
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as {
      id?: unknown;
    };
    const headers = new Headers();
    for (const [name, value] of Object.entries(req.headers)) {
      if (typeof value === "string") {
        headers.set(name, value);
      }
    }
    onRequest(body, headers);
    res.writeHead(200, { "content-type": "application/json" }).end(
      JSON.stringify({
        jsonrpc: "2.0",
        id: body.id,
        result: { resultType: "complete", content: [] },
      }),
    );
  });

  return new Promise((resolve, reject) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("failed to bind"));
        return;
      }
      resolve({
        url: `http://127.0.0.1:${address.port}/mcp`,
        close: () =>
          new Promise((closeResolve, closeReject) =>
            server.close((error) =>
              error ? closeReject(error) : closeResolve(),
            ),
          ),
      });
    });
  });
}

describe("postBackendMcpJsonRpc", () => {
  it("declares the tasks extension under Torii's outbound identity", async () => {
    assert.deepEqual(TORII_OUTBOUND_CLIENT_CAPABILITIES, {
      extensions: { [MCP_TASKS_EXTENSION_ID]: {} },
    });

    let captured: { body: unknown; headers: Headers } | undefined;
    const server = await listen((body, headers) => {
      captured = { body, headers };
    });

    try {
      const result = await postBackendMcpJsonRpc({
        url: server.url,
        method: "tools/call",
        params: { name: "echo", arguments: {} },
        headers: { authorization: "Bearer secret" },
        protocolVersion: MCP_PROTOCOL_VERSION,
      });
      assert.equal(result.resultType, "complete");

      const params = (captured?.body as { params?: Record<string, unknown> })
        .params;
      const meta = params?._meta as Record<string, unknown>;
      assert.equal(meta[PROTOCOL_VERSION_META_KEY], MCP_PROTOCOL_VERSION);
      assert.deepEqual(meta[CLIENT_INFO_META_KEY], TORII_OUTBOUND_CLIENT_INFO);
      assert.deepEqual(
        meta[CLIENT_CAPABILITIES_META_KEY],
        TORII_OUTBOUND_CLIENT_CAPABILITIES,
      );
      assert.equal(captured?.headers.get("authorization"), "Bearer secret");
    } finally {
      await server.close();
    }
  });
});
