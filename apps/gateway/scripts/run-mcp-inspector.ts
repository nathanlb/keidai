#!/usr/bin/env tsx
import { loadEnvForPackage } from "@keidai/shared";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { request as httpRequest } from "node:http";
import { writeFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn, type ChildProcess } from "node:child_process";

loadEnvForPackage(import.meta.url);

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    console.error(
      `Error: ${name} is required. Set it in the repo root .env (see .env.example).`,
    );
    process.exit(1);
  }
  return value;
}

function resolveToriiMcpUrl(): URL {
  const host = process.env.TORII_HOST?.trim() || "127.0.0.1";
  const rawPort = process.env.TORII_PORT ?? process.env.PORT ?? "3100";
  const port = Number.parseInt(rawPort, 10);
  if (!Number.isFinite(port) || port <= 0) {
    console.error(`Error: Invalid TORII_PORT: ${rawPort}`);
    process.exit(1);
  }
  return new URL(`http://${host}:${port}/mcp`);
}

function forwardRequest(
  clientReq: IncomingMessage,
  clientRes: ServerResponse,
  target: URL,
  bearer: string,
): void {
  const headers = { ...clientReq.headers };
  headers.authorization = `Bearer ${bearer}`;

  const proxyReq = httpRequest(
    {
      protocol: target.protocol,
      hostname: target.hostname,
      port: target.port,
      path: target.pathname + target.search,
      method: clientReq.method,
      headers,
    },
    (proxyRes) => {
      clientRes.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers);
      proxyRes.pipe(clientRes);
    },
  );

  proxyReq.on("error", (error) => {
    if (!clientRes.headersSent) {
      clientRes.writeHead(502, { "content-type": "text/plain" });
    }
    clientRes.end(
      `Torii auth shim could not reach ${target.origin}: ${error.message}`,
    );
  });

  clientReq.pipe(proxyReq);
}

function startToriiAuthShim(
  target: URL,
  bearer: string,
): Promise<{ url: URL; close: () => Promise<void> }> {
  return new Promise((resolve, reject) => {
    const server = createServer((clientReq, clientRes) => {
      forwardRequest(clientReq, clientRes, target, bearer);
    });

    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Failed to resolve Torii auth shim listen address"));
        return;
      }

      resolve({
        url: new URL(`http://127.0.0.1:${address.port}/mcp`),
        close: () =>
          new Promise((closeResolve, closeReject) => {
            server.close((error) => {
              if (error) {
                closeReject(error);
                return;
              }
              closeResolve();
            });
          }),
      });
    });
  });
}

function writeInspectorConfig(shimUrl: URL): string {
  const configDir = mkdtempSync(join(tmpdir(), "torii-mcp-inspector-"));
  const configPath = join(configDir, "mcp-inspector.config.json");
  writeFileSync(
    configPath,
    JSON.stringify(
      {
        mcpServers: {
          torii: {
            type: "streamable-http",
            url: shimUrl.toString(),
          },
        },
      },
      null,
      2,
    ),
    "utf8",
  );
  return configPath;
}

function spawnInspector(configPath: string): ChildProcess {
  return spawn(
    "mcp-inspector",
    ["--config", configPath, "--server", "torii"],
    {
      stdio: "inherit",
      env: process.env,
    },
  );
}

async function main(): Promise<void> {
  const bearer = requiredEnv("DEMO_AGENT_BEARER");
  const toriiUrl = resolveToriiMcpUrl();
  const shim = await startToriiAuthShim(toriiUrl, bearer);
  const configPath = writeInspectorConfig(shim.url);

  console.log(`Torii MCP endpoint: ${toriiUrl}`);
  console.log(
    `Inspector auth shim: ${shim.url} (injects Authorization from DEMO_AGENT_BEARER)`,
  );

  const inspector = spawnInspector(configPath);
  let shuttingDown = false;

  const shutdown = async (exitCode = 0): Promise<void> => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    inspector.kill("SIGTERM");
    await shim.close().catch(() => undefined);
    process.exit(exitCode);
  };

  process.on("SIGINT", () => {
    void shutdown(0);
  });
  process.on("SIGTERM", () => {
    void shutdown(0);
  });

  inspector.on("exit", (code, signal) => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    void shim.close().finally(() => {
      if (signal) {
        process.kill(process.pid, signal);
        return;
      }
      process.exit(code ?? 0);
    });
  });
}

void main();
