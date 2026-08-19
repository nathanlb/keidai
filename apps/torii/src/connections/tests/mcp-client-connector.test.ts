import "reflect-metadata";
import assert from "node:assert/strict";
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import { describe, it } from "node:test";
import type { ServerConfig } from "@keidai/shared";
import { DEFAULT_NEGOTIATED_PROTOCOL_VERSION } from "@modelcontextprotocol/client";
import { MCP_PROTOCOL_VERSION } from "@keidai/shared/mcp-jsonrpc";
import { createCredentialServices } from "../../credentials/tests/test-helpers.js";
import { DefaultMcpClientConnector } from "../mcp-client-connector.service.js";

type JsonRpc = {
  jsonrpc?: string;
  id?: unknown;
  method?: string;
  params?: { protocolVersion?: string };
};

function serverConfig(url: string): ServerConfig {
  return {
    name: "backend",
    transport: { type: "http", url },
    credential: { strategy: "none" },
  };
}

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

function listen(server: Server): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address !== "object") {
        reject(new Error("Failed to resolve stub port"));
        return;
      }
      resolve(address.port);
    });
  });
}

async function startJsonRpcStub(
  handle: (message: JsonRpc, res: ServerResponse) => boolean,
): Promise<{ url: string; close: () => Promise<void> }> {
  const server = createServer(async (req, res) => {
    if (req.method === "GET" || req.method === "DELETE") {
      res.writeHead(405).end();
      return;
    }
    if (req.method !== "POST") {
      res.writeHead(404).end();
      return;
    }

    const message = JSON.parse(await readBody(req)) as JsonRpc;
    if (message.id === undefined) {
      res.writeHead(202).end();
      return;
    }
    if (!handle(message, res)) {
      sendJson(res, 200, {
        jsonrpc: "2.0",
        id: message.id ?? null,
        error: { code: -32601, message: "Method not found" },
      });
    }
  });

  const port = await listen(server);
  return {
    url: `http://127.0.0.1:${port}/mcp`,
    close: () =>
      new Promise((resolve, reject) => {
        server.closeAllConnections();
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

describe("DefaultMcpClientConnector protocol negotiation", () => {
  it("connects to a 2025-03-26 server that rejects 2025-11-25", async () => {
    const stub = await startJsonRpcStub((message, res) => {
      if (message.method === "initialize") {
        const offered = message.params?.protocolVersion;
        if (offered !== DEFAULT_NEGOTIATED_PROTOCOL_VERSION) {
          sendJson(res, 200, {
            jsonrpc: "2.0",
            id: message.id ?? null,
            error: {
              code: -32602,
              message: `Unsupported protocol version: ${offered}`,
            },
          });
          return true;
        }
        sendJson(res, 200, {
          jsonrpc: "2.0",
          id: message.id ?? null,
          result: {
            protocolVersion: DEFAULT_NEGOTIATED_PROTOCOL_VERSION,
            capabilities: { tools: {} },
            serverInfo: { name: "legacy-mcp", version: "1.0.0" },
          },
        });
        return true;
      }
      return false;
    });

    const { credentialResolver } = createCredentialServices();
    const connector = new DefaultMcpClientConnector(credentialResolver);
    let client;
    try {
      client = await connector.connect(serverConfig(stub.url));
      assert.equal(
        client.getNegotiatedProtocolVersion(),
        DEFAULT_NEGOTIATED_PROTOCOL_VERSION,
      );
    } finally {
      await client?.close();
      await stub.close();
    }
  });

  it("connects to a 2026-07-28 server via server/discover", async () => {
    const stub = await startJsonRpcStub((message, res) => {
      if (message.method === "server/discover") {
        sendJson(res, 200, {
          jsonrpc: "2.0",
          id: message.id ?? null,
          result: {
            resultType: "complete",
            supportedVersions: [MCP_PROTOCOL_VERSION],
            capabilities: { tools: {} },
            serverInfo: { name: "modern-mcp", version: "1.0.0" },
          },
        });
        return true;
      }
      return false;
    });

    const { credentialResolver } = createCredentialServices();
    const connector = new DefaultMcpClientConnector(credentialResolver);
    let client;
    try {
      client = await connector.connect(serverConfig(stub.url));
      assert.equal(client.getNegotiatedProtocolVersion(), MCP_PROTOCOL_VERSION);
    } finally {
      await client?.close();
      await stub.close();
    }
  });
});
