import { loadEnvForPackage, taskSchema } from "@keidai/shared";

loadEnvForPackage(import.meta.url);

import { BOOT_TASK } from "./config/boot-task.js";
import { loadRuntimeConfig } from "./config/runtime-config.js";
import { defaultLogger } from "./logging/logger.js";
import { startHarnessRun } from "./run/harness.js";

function previewOf(value: string, maxLength = 200): string {
  const flattened = value.replace(/\s+/g, " ").trim();
  return flattened.length > maxLength
    ? `${flattened.slice(0, maxLength)}…`
    : flattened;
}

async function main(): Promise<void> {
  const config = loadRuntimeConfig();
  const task = taskSchema.parse(BOOT_TASK);

  if (task.assignee !== config.agentId) {
    throw new Error(
      `Task assignee (${task.assignee}) must match agent id (${config.agentId})`,
    );
  }

  defaultLogger.info("boot.task_loaded", {
    assignee: task.assignee,
    agentId: config.agentId,
    goal: previewOf(task.goal),
  });

  await startHarnessRun(task, config);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  defaultLogger.error("boot.fatal", { error: message });
  process.exit(1);
});
