import { loadEnvForPackage } from "@keidai/shared/load-env";

/** Same resolution as `src/index.ts`: repo root `.env`, then `apps/shaiden/.env`. */
loadEnvForPackage(new URL("../src/index.ts", import.meta.url));
