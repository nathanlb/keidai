import { loadEnvForPackage } from "@keidai/shared/load-env";

loadEnvForPackage(import.meta.url);

import { createServer } from "./create-server.js";
import { OperatorAuthConfigError } from "./auth/config.js";

/**
 * API-only BFF for local Vite HMR. Vite binds `:3000` and proxies
 * `/api`, `/auth`, and `/oauth/callback` here; static SPA is served by Vite.
 *
 * Uses `KEIDAI_UI_BFF_PORT` (default 3001) so a production `KEIDAI_UI_PORT=3000`
 * in `.env` does not collide with the Vite HMR port.
 */
const port = Number(process.env.KEIDAI_UI_BFF_PORT ?? 3001);
const host = process.env.KEIDAI_UI_HOST ?? "127.0.0.1";

try {
  const app = await createServer({ serveStatic: false });
  await app.listen({ port, host });
  console.log(`keidai-ui BFF (api): http://${host}:${port}`);
} catch (error) {
  if (error instanceof OperatorAuthConfigError) {
    console.error(`keidai-ui auth config: ${error.message}`);
    process.exit(1);
  }
  throw error;
}
