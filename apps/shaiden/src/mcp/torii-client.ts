import {
  Client,
  StreamableHTTPClientTransport,
  type PriorDiscovery,
} from "@modelcontextprotocol/client";
import {
  MCP_CREATE_TASK_RESULT_TYPE,
  MCP_TASKS_GET_METHOD,
  isMcpTaskTerminalStatus,
  mcpCreateTaskResultSchema,
} from "@keidai/shared";
import {
  listToolsCacheIsStale,
  listToolsExpiresAtMs,
  readListToolsCacheHint,
} from "./list-tools-cache.js";
import {
  mapCallToolResponse,
  mapTerminalMcpTaskToToolCallResult,
  tryMapTerminalCreateTaskResult,
} from "./parse-tool-result.js";
import { pollUntilTerminalMcpTask, createTaskPollWake } from "./poll-mcp-task.js";
import { listenForTaskNotifications } from "./listen-task-notifications.js";
import {
  MCP_PROTOCOL_VERSION,
  SHAIDEN_CLIENT_CAPABILITIES,
  SHAIDEN_CLIENT_INFO,
  postMcpJsonRpc,
} from "./post-mcp-jsonrpc.js";
import { PolicyDeniedError } from "./types/policy-denied-error.js";
import type {
  DiscoveredTool,
  ToriiSession,
  ToriiSessionCredential,
} from "./types/index.js";

const RECONNECTION_OPTIONS = {
  maxReconnectionDelay: 1000,
  initialReconnectionDelay: 100,
  reconnectionDelayGrowFactor: 1.5,
  maxRetries: 0,
} as const;

function toDiscoveredTool(tool: {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}): DiscoveredTool {
  return {
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
  };
}

function describeUnknownError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function toToolCallError(error: unknown): Error {
  const message = describeUnknownError(error);
  if (/(^|\b)policy_denied\b/i.test(message)) {
    return new PolicyDeniedError(message);
  }
  return error instanceof Error ? error : new Error(message);
}

/**
 * Build a Torii MCP caller for one harness run.
 *
 * This is not a protocol session: each `listTools` / `callTool` / `pollMcpTask`
 * opens a fresh request, pins 2026-07-28, and closes afterward. Token refresh
 * happens before every call, including each `tasks/get` poll.
 *
 * Gated tools return `resultType: "task"`. `callTool` surfaces that as a park
 * handle; `pollMcpTask` drives `tasks/get` until the completed tool result.
 * A healthy `subscriptions/listen` stream is an early wake only — the next
 * `tasks/get` is still the source of truth, and a dropped stream is ignored.
 */
export async function connectToriiSession(
  toriiMcpUrl: string,
  credential: ToriiSessionCredential,
): Promise<ToriiSession> {
  const authHeaders: Record<string, string> = {
    Authorization: `Bearer ${await credential.ensureToken()}`,
  };

  const applyToken = async (options?: { force?: boolean }): Promise<void> => {
    const token = await credential.ensureToken(options);
    authHeaders.Authorization = `Bearer ${token}`;
  };

  /** Cached after the first successful connect so later requests skip the probe. */
  let prior: PriorDiscovery | undefined;

  const tools: DiscoveredTool[] = [];
  let toolsExpiresAtMs: number | undefined;

  const openClient = async (): Promise<Client> => {
    const client = new Client(SHAIDEN_CLIENT_INFO, {
      capabilities: SHAIDEN_CLIENT_CAPABILITIES,
      versionNegotiation: { mode: { pin: MCP_PROTOCOL_VERSION } },
    });
    const transport = new StreamableHTTPClientTransport(new URL(toriiMcpUrl), {
      requestInit: {
        headers: authHeaders,
      },
      reconnectionOptions: RECONNECTION_OPTIONS,
    });
    await client.connect(transport, prior ? { prior } : undefined);

    const discover = client.getDiscoverResult();
    if (discover) {
      prior = { kind: "modern", discover };
    }

    return client;
  };

  const closeClientQuietly = async (client: Client): Promise<void> => {
    try {
      await client.close();
    } catch {
      // Best-effort teardown between per-request calls.
    }
  };

  const replaceTools = (next: DiscoveredTool[]): void => {
    tools.splice(0, tools.length, ...next);
  };

  const refreshTools = async (): Promise<void> => {
    const client = await openClient();
    try {
      const listed = await client.listTools(undefined, { cacheMode: "refresh" });
      replaceTools(listed.tools.map(toDiscoveredTool));
      toolsExpiresAtMs = listToolsExpiresAtMs(readListToolsCacheHint(listed));
    } finally {
      await closeClientQuietly(client);
    }
  };

  const postJsonRpc = async (
    method: string,
    params: Record<string, unknown>,
  ): Promise<Record<string, unknown>> => {
    const authorization = authHeaders.Authorization;
    if (!authorization) {
      throw new Error("missing Authorization header for MCP request");
    }
    return postMcpJsonRpc({
      mcpUrl: toriiMcpUrl,
      authorization,
      method,
      params,
    });
  };

  await refreshTools();

  const pollMcpTask: ToriiSession["pollMcpTask"] = async (
    taskId,
    pollIntervalMs,
  ) => {
    const abort = new AbortController();
    const wake = createTaskPollWake();
    void listenForTaskNotifications({
      mcpUrl: toriiMcpUrl,
      authorization: authHeaders.Authorization ?? "",
      taskId,
      onWake: () => wake.signal(),
      signal: abort.signal,
    });
    try {
      const terminal = await pollUntilTerminalMcpTask({
        initialPollIntervalMs: pollIntervalMs,
        wake,
        getTask: async () => {
          await applyToken();
          return postJsonRpc(MCP_TASKS_GET_METHOD, { taskId });
        },
      });
      return mapTerminalMcpTaskToToolCallResult(terminal);
    } catch (error) {
      throw toToolCallError(error);
    } finally {
      abort.abort();
    }
  };

  const callTool: ToriiSession["callTool"] = async (name, args) => {
    await applyToken();
    if (listToolsCacheIsStale(toolsExpiresAtMs)) {
      await refreshTools();
    }

    try {
      const response = await postJsonRpc("tools/call", {
        name,
        arguments: args,
      });

      if (response.resultType === MCP_CREATE_TASK_RESULT_TYPE) {
        const created = mcpCreateTaskResultSchema.parse(response);
        if (isMcpTaskTerminalStatus(created.status)) {
          const mapped = tryMapTerminalCreateTaskResult(response);
          if (mapped) {
            return mapped;
          }
          return pollMcpTask(created.taskId, created.pollIntervalMs);
        }
        return {
          isError: false,
          text: created.statusMessage ?? "",
          approvalRequired: {
            approvalId: created.taskId,
            pollIntervalMs: created.pollIntervalMs,
          },
        };
      }

      return mapCallToolResponse(response);
    } catch (error) {
      throw toToolCallError(error);
    }
  };

  return {
    tools,
    callTool,
    pollMcpTask,
    close: async () => {
      // Per-request callers hold no stream; nothing to tear down.
    },
  };
}
