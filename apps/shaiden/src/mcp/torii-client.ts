import { Client } from "@modelcontextprotocol/sdk/client";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
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
import { enrichToolCallResult } from "./parse-tool-result.js";
import { PolicyDeniedError } from "./types/policy-denied-error.js";
import type {
  DiscoveredTool,
  ToriiSession,
  ToriiSessionCredential,
} from "./types/index.js";

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

/**
 * Connect to Torii over MCP and keep the session open for the duration of a
 * run: tool discovery happens once at connect, tool calls dispatch through
 * the same session so they show up in Torii traces.
 *
 * Authorization uses a Fuda-minted agent JWT from `credential.ensureToken`.
 * The header is refreshed before each tools/call (and on explicit remint) so
 * short TTLs outlive long tasks without reconnecting.
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

  const client = new Client({
    name: "shaiden",
    version: "0.1.0",
  });
  const transport = new StreamableHTTPClientTransport(new URL(toriiMcpUrl), {
    requestInit: {
      headers: authHeaders,
    },
    reconnectionOptions: {
      maxReconnectionDelay: 1000,
      initialReconnectionDelay: 100,
      reconnectionDelayGrowFactor: 1.5,
      maxRetries: 0,
    },
  });

  await client.connect(transport);
  const result = await client.listTools();

  let activeResumeSignal: ApprovalResumeSignal | undefined;

  const failParkedApprovals = () => {
    activeResumeSignal?.dispose();
  };
  // SSE drop (maxRetries: 0) fires onerror without onclose; both paths must
  // unblock parked approval waiters so the run can terminate as failed.
  client.onerror = failParkedApprovals;
  client.onclose = failParkedApprovals;

  const callTool: ToriiSession["callTool"] = async (name, args) => {
    await applyToken();
    try {
      const response = await client.callTool({ name, arguments: args });
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
    } catch (error) {
      throw toToolCallError(error);
    }
  };

  return {
    tools: result.tools.map(toDiscoveredTool),
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
          client.fallbackNotificationHandler = async (notification) => {
            if (notification.method !== APPROVAL_DECIDED_NOTIFICATION_METHOD) {
              return;
            }
            handler(
              notification.params as unknown as ApprovalDecidedNotificationParams,
            );
          };
          return () => {
            client.fallbackNotificationHandler = undefined;
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
      await client.close();
    },
  };
}
