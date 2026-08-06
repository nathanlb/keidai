import { loadEnvForPackage } from "@keidai/shared/load-env";

loadEnvForPackage(import.meta.url);

import { createServer } from "./create-server.js";
import { OperatorAuthConfigError } from "./auth/config.js";

const port = Number(process.env.KEIDAI_UI_PORT ?? 3000);
const host = process.env.KEIDAI_UI_HOST ?? "127.0.0.1";

try {
  const app = await createServer();
  await app.listen({ port, host });
  console.log(`keidai-ui: http://${host}:${port}`);
} catch (error) {
  if (error instanceof OperatorAuthConfigError) {
    console.error(`keidai-ui auth config: ${error.message}`);
    process.exit(1);
  }
  throw error;
}
