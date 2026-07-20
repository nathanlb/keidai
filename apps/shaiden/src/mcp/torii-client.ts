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
import type { DiscoveredTool, ToolCallResult, ToriiSession } from "./types/index.js";

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

/**
 * Connect to Torii over MCP and keep the session open for the duration of a
 * run: tool discovery happens once at connect, tool calls dispatch through
 * the same session so they show up in Torii traces.
 */
export async function connectToriiSession(
  toriiMcpUrl: string,
  bearerToken: string,
): Promise<ToriiSession> {
  const client = new Client({
    name: "shaiden",
    version: "0.1.0",
  });
  const transport = new StreamableHTTPClientTransport(new URL(toriiMcpUrl), {
    requestInit: {
      headers: {
        Authorization: `Bearer ${bearerToken}`,
      },
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

  const callTool = async (
    name: string,
    args: Record<string, unknown>,
  ): Promise<ToolCallResult> => {
    const response = await client.callTool({ name, arguments: args });
    const result = enrichToolCallResult(
      response.isError === true,
      flattenToolContent(response.content),
    );
    const meta = extractToriiCallMeta(response._meta);
    return meta ? { ...result, meta } : result;
  };

  return {
    tools: result.tools.map(toDiscoveredTool),
    callTool,
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
