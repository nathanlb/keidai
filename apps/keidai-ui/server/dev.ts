import { spawn, type ChildProcess } from "node:child_process";
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
  return spawn("pnpm", ["exec", "vite"], {
    cwd: new URL("..", import.meta.url),
    stdio: "inherit",
    shell: true,
  });
}

async function main(): Promise<void> {
  const vite = startVite();

  const shutdown = () => {
    vite.kill("SIGTERM");
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  await waitForVite(VITE_URL);

  const app = await createServer({
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
