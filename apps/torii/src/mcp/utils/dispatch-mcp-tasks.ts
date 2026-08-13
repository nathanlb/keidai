import {
  CLIENT_CAPABILITIES_META_KEY,
  ProtocolErrorCode,
} from "@modelcontextprotocol/server";
import type { AgentPrincipal } from "@keidai/shared";
import {
  MCP_COMPLETE_RESULT_TYPE,
  MCP_TASKS_CANCEL_METHOD,
  MCP_TASKS_EXTENSION_ID,
  MCP_TASKS_GET_METHOD,
  MCP_TASKS_UPDATE_METHOD,
  clientDeclaresTasksExtension,
  isMcpTaskTerminalStatus,
  toGetTaskResult,
  type McpInputResponses,
  type McpTasksMethod,
} from "@keidai/shared";
import { McpTaskLookupError } from "../../tasks/types/mcp-task.js";
import type { TaskStoreService } from "../../tasks/task-store.service.js";

export const MISSING_TASKS_EXTENSION_ERROR = {
  code: ProtocolErrorCode.MissingRequiredClientCapability,
  message: "Missing required client capability",
  data: {
    requiredCapabilities: {
      extensions: {
        [MCP_TASKS_EXTENSION_ID]: {},
      },
    },
  },
} as const;

export type McpTasksDispatchResult =
  | { ok: true; result: Record<string, unknown> }
  | { ok: false; error: { code: number; message: string; data?: unknown } };

/**
 * Dispatch `tasks/get` | `tasks/update` | `tasks/cancel`.
 *
 * Handled outside the MCP TypeScript SDK: the 2026-07-28 era codec dropped
 * the 2025-11-25 `tasks/*` methods, so `tasks/get` and `tasks/cancel` would
 * be answered Method not found before a registered handler could run.
 */
export async function dispatchMcpTasksMethod(input: {
  method: McpTasksMethod;
  body: unknown;
  principal: AgentPrincipal;
  taskStore: TaskStoreService;
  executeApprovedTask?: (taskId: string) => Promise<void>;
  onTaskCancelled?: (taskId: string) => void;
}): Promise<McpTasksDispatchResult> {
  if (!clientDeclaresTasksExtension(readClientCapabilities(input.body))) {
    return { ok: false, error: MISSING_TASKS_EXTENSION_ERROR };
  }

  const params = readParams(input.body);
  const taskId = typeof params.taskId === "string" ? params.taskId : "";
  if (taskId.length === 0) {
    return {
      ok: false,
      error: {
        code: ProtocolErrorCode.InvalidParams,
        message: "Invalid params: taskId is required",
      },
    };
  }

  try {
    switch (input.method) {
      case MCP_TASKS_GET_METHOD: {
        const current = input.taskStore.getDetailedTask(
          input.principal.agentId,
          taskId,
        );
        if (
          !isMcpTaskTerminalStatus(current.status) &&
          input.executeApprovedTask
        ) {
          await input.executeApprovedTask(taskId);
        }
        return {
          ok: true,
          result: { ...toGetTaskResult(
            input.taskStore.getDetailedTask(input.principal.agentId, taskId),
          ) },
        };
      }
      case MCP_TASKS_UPDATE_METHOD: {
        const inputResponses = params.inputResponses;
        if (
          inputResponses === null ||
          typeof inputResponses !== "object" ||
          Array.isArray(inputResponses)
        ) {
          return {
            ok: false,
            error: {
              code: ProtocolErrorCode.InvalidParams,
              message: "Invalid params: inputResponses is required",
            },
          };
        }
        input.taskStore.applyInputResponses(
          input.principal.agentId,
          taskId,
          inputResponses as McpInputResponses,
        );
        return {
          ok: true,
          result: { resultType: MCP_COMPLETE_RESULT_TYPE },
        };
      }
      case MCP_TASKS_CANCEL_METHOD:
        input.taskStore.requestCancel(input.principal.agentId, taskId);
        input.onTaskCancelled?.(taskId);
        return {
          ok: true,
          result: { resultType: MCP_COMPLETE_RESULT_TYPE },
        };
    }
  } catch (error) {
    if (error instanceof McpTaskLookupError) {
      return {
        ok: false,
        error: {
          code: ProtocolErrorCode.InvalidParams,
          message: error.message,
        },
      };
    }
    throw error;
  }
}

function readParams(body: unknown): {
  taskId?: unknown;
  inputResponses?: unknown;
} {
  if (!body || typeof body !== "object") {
    return {};
  }
  const params = (body as { params?: unknown }).params;
  if (!params || typeof params !== "object") {
    return {};
  }
  return params as { taskId?: unknown; inputResponses?: unknown };
}

export function readClientCapabilities(body: unknown): unknown {
  if (!body || typeof body !== "object") {
    return undefined;
  }
  const params = (body as { params?: unknown }).params;
  if (!params || typeof params !== "object") {
    return undefined;
  }
  const meta = (params as { _meta?: unknown })._meta;
  if (!meta || typeof meta !== "object") {
    return undefined;
  }
  return (meta as Record<string, unknown>)[CLIENT_CAPABILITIES_META_KEY];
}
