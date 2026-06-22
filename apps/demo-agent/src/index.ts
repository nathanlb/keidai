import { loadEnvForPackage } from "@keidai/shared";

loadEnvForPackage(import.meta.url);

import { loadDemoConfig } from "./config.js";
import { runDemoScenario } from "./scenario.js";

function printFatal(error: unknown): void {
  if (error instanceof Error) {
    console.error(error.message);
    if (error.cause instanceof Error) {
      console.error(error.cause.message);
    }
    return;
  }
  console.error(error);
}

async function main(): Promise<void> {
  await runDemoScenario(loadDemoConfig());
}

main().catch((error) => {
  printFatal(error);
  process.exitCode = 1;
});
