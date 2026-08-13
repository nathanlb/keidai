import {
  createMcpHandler,
  McpServer,
  ProtocolError,
  ProtocolErrorCode,
  type McpHttpHandler,
} from "@modelcontextprotocol/server";
import { toNodeHandler, type NodeMcpRequestHandler } from "@modelcontextprotocol/node";
import {
  MCP_TASKS_EXTENSION_ID,
  PolicyDecision,
  clientDeclaresTasksExtension,
  isMcpTasksMethod,
} from "@keidai/shared";
import type { AgentPrincipal, Logger } from "@keidai/shared";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { inject, injectable } from "tsyringe";
import { ToolCatalogService } from "../catalog/tool-catalog.service.js";
import {
  CredentialResolutionError,
  LinkingRequiredError,
} from "../credentials/types/credential-resolution.js";
import { ToolDispatchService } from "../dispatch/tool-dispatch.service.js";
import { isParkedTaskResult } from "../dispatch/utils/is-parked-task-result.js";
import { runWithAgentPrincipal } from "../identity/agent-principal-context.js";
import { InboundIdentityService } from "../identity/inbound-identity.service.js";
import { StructuredLoggerService } from "../logging/structured-logger.service.js";
import { IdentityResolutionError } from "../identity/types/identity-resolution-error.js";
import {
  BackendUnavailableError,
  ToolNotFoundError,
} from "../dispatch/types/tool-dispatch.js";
import { PolicyDeniedError } from "../policy/types/policy-denied.js";
import type { TraceEmitter } from "../trace/types/trace-emitter.js";
import { TraceEmitterService } from "../trace/trace-emitter.service.js";
import {
  createTraceId,
  createTraceTimestamp,
  finalizeCallTrace,
} from "../trace/utils/build-call-trace.js";
import { parseNamespacedToolName } from "../trace/utils/parse-namespaced-tool-name.js";
import { readPackageVersion } from "../http/utils/read-package-version.js";
import {
  mcpHeaderMismatchError,
  mcpIdentityDeniedError,
  mcpInternalServerError,
  mcpJsonRpcError,
  mcpJsonRpcResult,
  sendMcpHttpError,
  sendMcpJsonRpc,
} from "./utils/mcp-http-errors.js";
import {
  resolveInboundMcpRequest,
  type InboundMcpRequestContext,
} from "./utils/parse-inbound-mcp-request.js";
import { dispatchMcpTasksMethod, readClientCapabilities, MISSING_TASKS_EXTENSION_ERROR } from "./utils/dispatch-mcp-tasks.js";
import { TaskStoreService } from "../tasks/task-store.service.js";

const GATEWAY_SERVER_INFO = {
  name: "torii-gateway",
  version: readPackageVersion(),
} as const;

@injectable()
export class GatewayMcpServer {
  private readonly mcpHandler: McpHttpHandler;
  private readonly nodeHandler: NodeMcpRequestHandler;

  constructor(
    @inject(ToolCatalogService)
    private readonly toolCatalog: ToolCatalogService,
    @inject(ToolDispatchService)
    private readonly toolDispatch: ToolDispatchService,
    @inject(TaskStoreService)
    private readonly taskStore: TaskStoreService,
    @inject(InboundIdentityService)
    private readonly inboundIdentity: InboundIdentityService,
    @inject(TraceEmitterService)
    private readonly traceEmitter: TraceEmitter,
    @inject(StructuredLoggerService)
    private readonly logger: Logger,
  ) {
    this.mcpHandler = createMcpHandler(() => this.createMcpServer(), {
      legacy: "reject",
      onerror: (error) => {
        this.logger.error("mcp.request_error", { error: error.message });
      },
    });
    this.nodeHandler = toNodeHandler(this.mcpHandler, {
      onerror: (error) => {
        this.logger.error("mcp.request_error", { error: error.message });
      },
    });
  }

  registerRoutes(app: FastifyInstance): void {
    app.post("/mcp", async (request, reply) => {
      await this.handlePost(request, reply);
    });
  }

  private async handlePost(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const inbound = resolveInboundMcpRequest(request.headers, request.body);
    if (!inbound.ok) {
      sendMcpHttpError(
        reply,
        400,
        mcpHeaderMismatchError(inbound.context.id, inbound.message),
      );
      return;
    }
    const mcpRequest = inbound.context;

    const principalResult = await this.resolvePrincipal(request);
    if (!principalResult.ok) {
      this.emitIdentityFailureTrace(mcpRequest, principalResult.message);
      sendMcpHttpError(
        reply,
        401,
        mcpIdentityDeniedError(mcpRequest.id, principalResult.message),
      );
      return;
    }

    try {
      const method = mcpRequest.method;
      if (method && isMcpTasksMethod(method)) {
        await runWithAgentPrincipal(principalResult.principal, async () => {
          const dispatched = await dispatchMcpTasksMethod({
            method,
            body: request.body,
            principal: principalResult.principal,
            taskStore: this.taskStore,
            executeApprovedTask: (taskId) =>
              this.toolDispatch.executeApprovedTask(taskId),
            onTaskCancelled: (taskId) =>
              this.toolDispatch.cancelPendingApprovalForTask(taskId),
          });
          if (dispatched.ok) {
            sendMcpJsonRpc(
              reply,
              mcpJsonRpcResult(mcpRequest.id, dispatched.result),
            );
            return;
          }
          sendMcpJsonRpc(
            reply,
            mcpJsonRpcError(mcpRequest.id, dispatched.error),
          );
        });
        return;
      }

      if (method === "tools/call" && mcpRequest.name) {
        const gated = await runWithAgentPrincipal(
          principalResult.principal,
          async () => {
            if (!this.toolDispatch.requiresApproval(mcpRequest.name!)) {
              return false;
            }
            await this.handleGatedToolsCall(
              request,
              reply,
              mcpRequest,
            );
            return true;
          },
        );
        if (gated) {
          return;
        }
      }

      // toNodeHandler writes the full HTTP response to reply.raw.
      reply.hijack();
      await runWithAgentPrincipal(principalResult.principal, async () => {
        await this.nodeHandler(request.raw, reply.raw, request.body);
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Internal server error";
      this.logger.error("mcp.request_error", { error: message });
      if (!reply.raw.headersSent) {
        reply.raw.writeHead(500, { "content-type": "application/json" });
        reply.raw.end(JSON.stringify(mcpInternalServerError(mcpRequest.id)));
      }
    }
  }

  private async resolvePrincipal(
    request: FastifyRequest,
  ): Promise<
    | { ok: true; principal: AgentPrincipal }
    | { ok: false; message: string }
  > {
    try {
      const principal = await this.inboundIdentity.resolveFromAuthorizationHeader(
        request.headers.authorization,
      );
      return { ok: true, principal };
    } catch (error) {
      const message =
        error instanceof IdentityResolutionError
          ? error.message
          : "Identity resolution failed";
      return { ok: false, message };
    }
  }

  private emitIdentityFailureTrace(
    mcpRequest: InboundMcpRequestContext,
    error: string,
  ): void {
    if (mcpRequest.method !== "tools/call" || !mcpRequest.name) {
      return;
    }

    const parsed = parseNamespacedToolName(mcpRequest.name);
    this.traceEmitter.emit(
      finalizeCallTrace(
        {
          server: parsed.server,
          tool: parsed.tool,
          policyDecision: PolicyDecision.Denied,
          error,
        },
        {
          traceId: createTraceId(),
          timestamp: createTraceTimestamp(),
        },
      ),
    );
  }

  private createMcpServer(): McpServer {
    const mcpServer = new McpServer(GATEWAY_SERVER_INFO, {
      capabilities: {
        tools: {},
        extensions: {
          [MCP_TASKS_EXTENSION_ID]: {},
        },
      },
    });

    mcpServer.server.setRequestHandler("tools/list", async () => {
      const listed = await this.toolCatalog.listToolsForAgent();
      return {
        tools: listed.tools,
        ttlMs: listed.ttlMs,
        cacheScope: listed.cacheScope,
      };
    });

    mcpServer.server.setRequestHandler("tools/call", async (request) => {
      try {
        const result = await this.toolDispatch.callTool(
          request.params.name,
          request.params.arguments,
        );
        if (isParkedTaskResult(result)) {
          throw ProtocolError.fromError(
            ProtocolErrorCode.InternalError,
            "Task-augmented tools/call must bypass the SDK codec",
          );
        }
        return result;
      } catch (error) {
        throw this.toMcpError(error);
      }
    });

    return mcpServer;
  }

  private async handleGatedToolsCall(
    request: FastifyRequest,
    reply: FastifyReply,
    mcpRequest: InboundMcpRequestContext,
  ): Promise<void> {
    if (!clientDeclaresTasksExtension(readClientCapabilities(request.body))) {
      sendMcpJsonRpc(
        reply,
        mcpJsonRpcError(mcpRequest.id, MISSING_TASKS_EXTENSION_ERROR),
      );
      return;
    }

    try {
      const result = await this.toolDispatch.callTool(
        mcpRequest.name!,
        readToolCallArguments(request.body),
      );
      sendMcpJsonRpc(
        reply,
        mcpJsonRpcResult(
          mcpRequest.id,
          result as unknown as Record<string, unknown>,
        ),
      );
    } catch (error) {
      const mapped = this.toMcpError(error);
      sendMcpJsonRpc(
        reply,
        mcpJsonRpcError(mcpRequest.id, {
          code: mapped.code,
          message: mapped.message,
        }),
      );
    }
  }

  /**
   * Map domain failures to JSON-RPC / MCP protocol errors.
   *
   * Code allocation (MCP 2025-11-25+ / SDK v2):
   * - `-32700`…`-32600` standard JSON-RPC
   * - `-32000`…`-32019` implementation-defined
   * - `-32020`…`-32099` reserved for the MCP spec (do not invent app codes here)
   * - Resource-not-found vocabulary is `-32602` on the wire (`InvalidParams`);
   *   `ProtocolErrorCode.ResourceNotFound` (`-32002`) is receive-tolerated only
   */
  private toMcpError(error: unknown): ProtocolError {
    if (error instanceof ProtocolError) {
      return error;
    }
    if (error instanceof PolicyDeniedError) {
      return ProtocolError.fromError(
        ProtocolErrorCode.InvalidRequest,
        error.message,
      );
    }
    if (error instanceof ToolNotFoundError) {
      // Unknown tool → InvalidParams (-32602), same wire code as resource-not-found.
      return ProtocolError.fromError(
        ProtocolErrorCode.InvalidParams,
        error.message,
      );
    }
    if (error instanceof BackendUnavailableError) {
      return ProtocolError.fromError(
        ProtocolErrorCode.InvalidRequest,
        error.message,
      );
    }
    if (error instanceof LinkingRequiredError) {
      return ProtocolError.fromError(
        ProtocolErrorCode.InvalidRequest,
        error.message,
      );
    }
    if (error instanceof CredentialResolutionError) {
      return ProtocolError.fromError(
        ProtocolErrorCode.InvalidRequest,
        error.message,
      );
    }
    if (error instanceof Error) {
      return ProtocolError.fromError(
        ProtocolErrorCode.InternalError,
        error.message,
      );
    }
    return ProtocolError.fromError(
      ProtocolErrorCode.InternalError,
      String(error),
    );
  }
}

function readToolCallArguments(
  body: unknown,
): Record<string, unknown> | undefined {
  if (!body || typeof body !== "object") {
    return undefined;
  }
  const params = (body as { params?: unknown }).params;
  if (!params || typeof params !== "object") {
    return undefined;
  }
  const args = (params as { arguments?: unknown }).arguments;
  if (args === undefined) {
    return undefined;
  }
  if (args === null || typeof args !== "object" || Array.isArray(args)) {
    return {};
  }
  return args as Record<string, unknown>;
}
