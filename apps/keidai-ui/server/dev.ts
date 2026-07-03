import { spawn, type ChildProcess } from "node:child_process";
import type { FastifyInstance } from "fastify";
import { createServer } from "./create-server.js";

const VITE_URL = "http://127.0.0.1:5173";

async function waitForVite(url: string, maxAttempts = 50): Promise<void> {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // Vite is still starting.
    }

    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  throw new Error("Vite dev server failed to start");
}

function startVite(): ChildProcess {
  // `detached` puts Vite (and its own children like esbuild) in a new process
  // group so we can signal the whole tree at once. Without this, killing only
  // the immediate child orphans esbuild and leaves port 5173 bound.
  return spawn("pnpm", ["exec", "vite"], {
    cwd: new URL("..", import.meta.url),
    stdio: "inherit",
    detached: true,
  });
}

function killViteGroup(vite: ChildProcess, signal: NodeJS.Signals): void {
  if (vite.pid === undefined || vite.exitCode !== null) {
    return;
  }

  try {
    // Negative pid targets the entire process group created by `detached`.
    process.kill(-vite.pid, signal);
  } catch {
    // Group already gone; fall back to signalling the child directly.
    try {
      vite.kill(signal);
    } catch {
      // Nothing left to kill.
    }
  }
}

async function main(): Promise<void> {
  const vite = startVite();
  let app: FastifyInstance | undefined;

  let shuttingDown = false;
  const shutdown = (exitCode: number) => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;

    killViteGroup(vite, "SIGTERM");

    const finish = () => {
      // Escalate in case Vite ignores SIGTERM, then exit.
      killViteGroup(vite, "SIGKILL");
      process.exit(exitCode);
    };

    if (app) {
      app.close().then(finish, finish);
    } else {
      finish();
    }
  };

  // If Vite dies on its own, tear the parent down too.
  vite.on("exit", () => {
    shutdown(1);
  });

  process.on("SIGINT", () => shutdown(0));
  process.on("SIGTERM", () => shutdown(0));

  await waitForVite(VITE_URL);

  app = await createServer({
    mode: "development",
    viteDevServerUrl: VITE_URL,
  });

  const port = Number(process.env.KEIDAI_UI_PORT ?? 3000);
  const host = process.env.KEIDAI_UI_HOST ?? "127.0.0.1";
  await app.listen({ port, host });
  console.log(`keidai-ui: http://${host}:${port} (proxying to Vite)`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
