import { loadEnvForPackage, taskSchema } from "@keidai/shared";

loadEnvForPackage(import.meta.url);

import { BOOT_TASK } from "./config/boot-task.js";
import { loadRuntimeConfig } from "./config/runtime-config.js";
import { startHarnessRun } from "./run/harness.js";

async function main(): Promise<void> {
  const config = loadRuntimeConfig();
  const task = taskSchema.parse(BOOT_TASK);

  if (task.assignee !== config.agentId) {
    throw new Error(
      `Task assignee (${task.assignee}) must match agent id (${config.agentId})`,
    );
  }

  await startHarnessRun(task, config);
}

main().catch((error) => {
  if (error instanceof Error) {
    console.error(error.message);
  } else {
    console.error(String(error));
  }

  process.exit(1);
});
