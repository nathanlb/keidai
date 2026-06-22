import { createServer as createHttpServer, type Server } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import selfsigned from "selfsigned";

export interface OAuthCallbackResult {
  code: string;
  state: string;
}

export interface LoopbackCallbackServer {
  waitForCallback(): Promise<OAuthCallbackResult>;
  close(): Promise<void>;
}

const SUCCESS_HTML = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>Torii OAuth</title></head>
<body>
  <p>Authorization complete. You can close this window and return to the terminal.</p>
</body>
</html>`;

function createLocalTlsMaterial(host: string): Promise<{ key: string; cert: string }> {
  const altNames: Array<{ type: 2 | 7; ip?: string; value?: string }> = [
    { type: 2, value: "localhost" },
  ];

  if (host === "127.0.0.1" || host === "::1") {
    altNames.push({ type: 7, ip: host });
  } else {
    altNames.push({ type: 2, value: host });
  }

  return selfsigned
    .generate([{ name: "commonName", value: host }], {
      algorithm: "sha256",
      keySize: 2048,
      extensions: [
        { name: "basicConstraints", cA: false },
        { name: "keyUsage", digitalSignature: true, keyEncipherment: true },
        { name: "extKeyUsage", serverAuth: true },
        { name: "subjectAltName", altNames },
      ],
    })
    .then((pems) => ({ key: pems.private, cert: pems.cert }));
}

export async function startLoopbackCallbackServer(
  redirectUri: string,
  timeoutMs = 120_000,
): Promise<LoopbackCallbackServer> {
  const parsed = new URL(redirectUri);
  const callbackPath = parsed.pathname || "/";
  const host = parsed.hostname;
  const port =
    parsed.port.length > 0 ? Number.parseInt(parsed.port, 10) : 8765;
  const useTls = parsed.protocol === "https:";

  let resolveCallback: (result: OAuthCallbackResult) => void;
  let rejectCallback: (error: Error) => void;

  const callbackPromise = new Promise<OAuthCallbackResult>((resolve, reject) => {
    resolveCallback = resolve;
    rejectCallback = reject;
  });

  const requestListener = (
    req: IncomingMessage,
    res: ServerResponse,
  ): void => {
    const scheme = useTls ? "https" : "http";
    const url = new URL(req.url ?? "/", `${scheme}://${req.headers.host ?? host}`);

    if (url.pathname !== callbackPath) {
      res.writeHead(404).end("Not found");
      return;
    }

    const error = url.searchParams.get("error");
    if (error) {
      const description = url.searchParams.get("error_description") ?? error;
      rejectCallback(new Error(`OAuth authorization denied: ${description}`));
      res.writeHead(400).end("Authorization denied");
      return;
    }

    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    if (!code || !state) {
      rejectCallback(new Error("OAuth callback missing code or state"));
      res.writeHead(400).end("Missing code or state");
      return;
    }

    resolveCallback({ code, state });
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }).end(
      SUCCESS_HTML,
    );
  };

  const server: Server = useTls
    ? createHttpsServer(await createLocalTlsMaterial(host), requestListener)
    : createHttpServer(requestListener);

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => resolve());
  });

  const timeout = setTimeout(() => {
    rejectCallback(new Error(`OAuth callback timed out after ${timeoutMs}ms`));
    server.close();
  }, timeoutMs);

  return {
    waitForCallback: () =>
      callbackPromise.finally(() => {
        clearTimeout(timeout);
      }),
    close: () =>
      new Promise((resolve, reject) => {
        clearTimeout(timeout);
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      }),
  };
}
