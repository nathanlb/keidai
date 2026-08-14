import {
  Client,
  StreamableHTTPClientTransport,
  type PriorDiscovery,
} from "@modelcontextprotocol/client";
import {
  APPROVAL_DECIDED_NOTIFICATION_METHOD,
  MCP_CREATE_TASK_RESULT_TYPE,
  MCP_TASKS_GET_METHOD,
  mcpCreateTaskResultSchema,
  type ApprovalDecidedNotificationParams,
} from "@keidai/shared";
import {
  createMcpNotificationApprovalResumeSignal,
  type ApprovalResumeSignal,
} from "../run/approval-resume-signal.js";
import {
  listToolsCacheIsStale,
  listToolsExpiresAtMs,
  readListToolsCacheHint,
} from "./list-tools-cache.js";
import {
  mapCallToolResponse,
  mapTerminalMcpTaskToToolCallResult,
} from "./parse-tool-result.js";
import { pollUntilTerminalMcpTask } from "./poll-mcp-task.js";
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
 * This is not a protocol session: each `listTools` / `callTool` opens a fresh
 * request, pins 2026-07-28 (`server/discover` + per-request `_meta` and routing
 * headers), and closes afterward. Token refresh still happens before every call.
 *
 * Gated tools return `resultType: "task"`. The SDK cannot consume that on
 * 2026-07-28, so `callTool` POSTs JSON-RPC directly, polls `tasks/get`, and
 * surfaces only the terminal tool result. Until NAT-147, a leftover
 * `approval_required` payload still parks a Client for
 * `notifications/approval_decided`.
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

  let approvalHandler:
    | ((params: ApprovalDecidedNotificationParams) => void)
    | undefined;
  let activeResumeSignal: ApprovalResumeSignal | undefined;
  /** Client held only while waiting on `notifications/approval_decided` (pre–NAT-147). */
  let parkedClient: Client | undefined;

  const failParkedApprovals = () => {
    activeResumeSignal?.dispose();
  };

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

  const attachApprovalHandler = (client: Client): void => {
    if (!approvalHandler) {
      return;
    }
    client.fallbackNotificationHandler = async (notification) => {
      if (notification.method !== APPROVAL_DECIDED_NOTIFICATION_METHOD) {
        return;
      }
      approvalHandler?.(
        notification.params as unknown as ApprovalDecidedNotificationParams,
      );
    };
    // SSE drop (maxRetries: 0) fires onerror without onclose; both paths must
    // unblock parked approval waiters so the run can terminate as failed.
    client.onerror = failParkedApprovals;
    client.onclose = failParkedApprovals;
  };

  const closeClientQuietly = async (client: Client): Promise<void> => {
    client.fallbackNotificationHandler = undefined;
    client.onerror = undefined;
    client.onclose = undefined;
    try {
      await client.close();
    } catch {
      // Best-effort teardown between per-request calls.
    }
  };

  const releaseParkedClient = async (): Promise<void> => {
    if (!parkedClient) {
      return;
    }
    const client = parkedClient;
    parkedClient = undefined;
    await closeClientQuietly(client);
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

  const callTool: ToriiSession["callTool"] = async (name, args) => {
    await applyToken();
    if (listToolsCacheIsStale(toolsExpiresAtMs)) {
      await refreshTools();
    }
    await releaseParkedClient();

    try {
      const response = await postJsonRpc("tools/call", {
        name,
        arguments: args,
      });

      if (response.resultType === MCP_CREATE_TASK_RESULT_TYPE) {
        const created = mcpCreateTaskResultSchema.parse(response);
        const terminal = await pollUntilTerminalMcpTask({
          initialPollIntervalMs: created.pollIntervalMs,
          getTask: async () => {
            await applyToken();
            return postJsonRpc(MCP_TASKS_GET_METHOD, { taskId: created.taskId });
          },
        });
        return mapTerminalMcpTaskToToolCallResult(terminal);
      }

      const result = mapCallToolResponse(response);
      if (result.approvalRequired) {
        const client = await openClient();
        attachApprovalHandler(client);
        parkedClient = client;
        return result;
      }
      return result;
    } catch (error) {
      throw toToolCallError(error);
    }
  };

  return {
    tools,
    callTool,
    remintCredentials: async () => {
      await applyToken({ force: true });
    },
    createApprovalResumeSignal: () => {
      if (activeResumeSignal) {
        activeResumeSignal.dispose();
      }

      activeResumeSignal = createMcpNotificationApprovalResumeSignal(
        (handler) => {
          approvalHandler = handler;
          if (parkedClient) {
            attachApprovalHandler(parkedClient);
          }
          return () => {
            approvalHandler = undefined;
            if (parkedClient) {
              parkedClient.fallbackNotificationHandler = undefined;
            }
          };
        },
        () => {
          activeResumeSignal = undefined;
        },
      );

      return activeResumeSignal;
    },
    close: async () => {
      activeResumeSignal?.dispose();
      await releaseParkedClient();
    },
  };
}
