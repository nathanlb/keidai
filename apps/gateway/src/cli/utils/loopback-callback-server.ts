import { createServer, type Server } from "node:http";

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

export async function startLoopbackCallbackServer(
  redirectUri: string,
  timeoutMs = 120_000,
): Promise<LoopbackCallbackServer> {
  const parsed = new URL(redirectUri);
  const callbackPath = parsed.pathname || "/";
  const host = parsed.hostname;
  const port =
    parsed.port.length > 0 ? Number.parseInt(parsed.port, 10) : 8765;

  let resolveCallback: (result: OAuthCallbackResult) => void;
  let rejectCallback: (error: Error) => void;

  const callbackPromise = new Promise<OAuthCallbackResult>((resolve, reject) => {
    resolveCallback = resolve;
    rejectCallback = reject;
  });

  const server: Server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? host}`);

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
  });

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
