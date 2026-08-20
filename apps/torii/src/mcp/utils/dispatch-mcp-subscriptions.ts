import type { AgentPrincipal } from "@keidai/shared";
import { McpTaskLookupError } from "../../tasks/types/mcp-task.js";
import type { TaskStoreService } from "../../tasks/task-store.service.js";

/**
 * Task IDs this replica will cover: owned, unexpired, and still known.
 * Unknown, foreign, and expired IDs are omitted rather than failing listen.
 */
export async function resolveCoveredTaskIds(input: {
  principal: AgentPrincipal;
  requested: readonly string[];
  taskStore: TaskStoreService;
}): Promise<string[]> {
  const covered: string[] = [];
  for (const taskId of input.requested) {
    try {
      await input.taskStore.requireOwnedTask(input.principal.agentId, taskId);
      covered.push(taskId);
    } catch (error) {
      if (error instanceof McpTaskLookupError) {
        continue;
      }
      throw error;
    }
  }
  return covered;
}
