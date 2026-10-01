import type { Logger } from "@keidai/shared";
import type { RunStore } from "../runs/run-store.js";
import type { SandboxClient } from "./sandbox-client.js";

/** Delete workspaces whose run is finished or gone. Covers a missed DELETE. */
export async function sweepSandboxWorkspaces(input: {
  sandbox: SandboxClient;
  runStore: RunStore;
  logger: Logger;
}): Promise<number> {
  const runIds = await input.sandbox.listRuns();
  let deleted = 0;
  for (const runId of runIds) {
    const run = await input.runStore.getRun(runId);
    if (run?.status === "running") {
      continue;
    }
    await input.sandbox.deleteRun(runId);
    input.logger.info("sandbox.workspace_swept", {
      runId,
      reason: run ? run.status : "missing",
    });
    deleted += 1;
  }
  return deleted;
}
