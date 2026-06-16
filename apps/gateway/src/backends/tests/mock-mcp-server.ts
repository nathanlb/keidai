import { createServer, type IncomingMessage, type Server } from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

export interface MockMcpServer {
  url: string;
  close(): Promise<void>;
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.from(chunk));
  }

  const text = Buffer.concat(chunks).toString("utf8");
  return text.length > 0 ? JSON.parse(text) : undefined;
}

function listen(server: Server): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Failed to resolve mock MCP server port"));
        return;
      }
      resolve(address.port);
    });
  });
}

export async function startMockMcpServer(options?: {
  rejectConnections?: boolean;
}): Promise<MockMcpServer> {
  const httpServer = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "127.0.0.1"}`);

    if (url.pathname !== "/mcp") {
      res.writeHead(404).end();
      return;
    }

    if (options?.rejectConnections) {
      res.writeHead(500).end("Internal Server Error");
      return;
    }

    if (req.method === "POST") {
      const body = await readJsonBody(req);
      const mcpServer = new McpServer({
        name: "mock-mcp-server",
        version: "1.0.0",
      });
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
      });

      await mcpServer.connect(transport);
      await transport.handleRequest(req, res, body);
      res.on("close", () => {
        void transport.close();
        void mcpServer.close();
      });
      return;
    }

    res.writeHead(405).end(
      JSON.stringify({
        jsonrpc: "2.0",
        error: {
          code: -32000,
          message: "Method not allowed.",
        },
        id: null,
      }),
    );
  });

  const port = await listen(httpServer);

  return {
    url: `http://127.0.0.1:${port}/mcp`,
    close: () =>
      new Promise((resolve, reject) => {
        httpServer.closeAllConnections();
        httpServer.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      }),
  };
}
