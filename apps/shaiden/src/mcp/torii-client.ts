import {
  Client,
  StreamableHTTPClientTransport,
  type PriorDiscovery,
} from "@modelcontextprotocol/client";
import {
  APPROVAL_DECIDED_NOTIFICATION_METHOD,
  TORII_CALL_META_KEY,
  type ApprovalDecidedNotificationParams,
  type ToriiCallMeta,
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
import { enrichToolCallResult } from "./parse-tool-result.js";
import { PolicyDeniedError } from "./types/policy-denied-error.js";
import type {
  DiscoveredTool,
  ToriiSession,
  ToriiSessionCredential,
} from "./types/index.js";

const CLIENT_INFO = { name: "shaiden", version: "0.1.0" } as const;

/** Declared on every Client; modern era also re-sends these via per-request `_meta`. */
const CLIENT_CAPABILITIES = {} as const;

const PROTOCOL_VERSION = "2026-07-28";

const RECONNECTION_OPTIONS = {
  maxReconnectionDelay: 1000,
  initialReconnectionDelay: 100,
  reconnectionDelayGrowFactor: 1.5,
  maxRetries: 0,
} as const;

function extractToriiCallMeta(meta: unknown): ToriiCallMeta | undefined {
  if (!meta || typeof meta !== "object") {
    return undefined;
  }
  const toriiMeta = (meta as Record<string, unknown>)[TORII_CALL_META_KEY];
  if (!toriiMeta || typeof toriiMeta !== "object") {
    return undefined;
  }
  const traceId = (toriiMeta as Record<string, unknown>).traceId;
  return typeof traceId === "string" ? { traceId } : undefined;
}

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

function flattenToolContent(content: unknown): string {
  if (!Array.isArray(content)) {
    return "";
  }
  return content
    .map((part) =>
      part &&
      typeof part === "object" &&
      "type" in part &&
      part.type === "text" &&
      "text" in part
        ? String(part.text)
        : JSON.stringify(part),
    )
    .join("\n");
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

function mapCallToolResponse(response: {
  isError?: boolean;
  content?: unknown;
  _meta?: unknown;
}) {
  const result = enrichToolCallResult(
    response.isError === true,
    flattenToolContent(response.content),
  );
  const meta = extractToriiCallMeta(response._meta);
  const withMeta = meta ? { ...result, meta } : result;
  if (withMeta.isError && /(^|\b)policy_denied\b/i.test(withMeta.text)) {
    return { ...withMeta, policyDenied: true };
  }
  return withMeta;
}

/**
 * Build a Torii MCP caller for one harness run.
 *
 * This is not a protocol session: each `listTools` / `callTool` opens a fresh
 * Client + Streamable HTTP transport, pins 2026-07-28 (`server/discover` +
 * per-request `_meta` and routing headers), and closes afterward. Token
 * refresh still happens before every call.
 *
 * Until NAT-147, a client that receives `approval_required` is kept open so
 * Torii can push `notifications/approval_decided` on the response stream.
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
    const client = new Client(CLIENT_INFO, {
      capabilities: CLIENT_CAPABILITIES,
      versionNegotiation: { mode: { pin: PROTOCOL_VERSION } },
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

  await refreshTools();

  const callTool: ToriiSession["callTool"] = async (name, args) => {
    await applyToken();
    if (listToolsCacheIsStale(toolsExpiresAtMs)) {
      await refreshTools();
    }
    // Prior approval wait finished (or never parked); drop any leftover stream.
    await releaseParkedClient();

    const client = await openClient();
    attachApprovalHandler(client);
    try {
      const response = await client.callTool({ name, arguments: args });
      const result = mapCallToolResponse(response);
      if (result.approvalRequired) {
        parkedClient = client;
        return result;
      }
      await closeClientQuietly(client);
      return result;
    } catch (error) {
      await closeClientQuietly(client);
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
