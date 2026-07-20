import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  isInitializeRequest,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { PolicyDecision } from "@keidai/shared";
import type { AgentPrincipal } from "@keidai/shared";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { inject, injectable } from "tsyringe";
import { ToolCatalogService } from "../catalog/tool-catalog.service.js";
import { CredentialResolutionError, LinkingRequiredError } from "../credentials/types/credential-resolution.js";
import { ToolDispatchService } from "../dispatch/tool-dispatch.service.js";
import { runWithAgentPrincipal } from "../identity/agent-principal-context.js";
import { InboundIdentityService } from "../identity/inbound-identity.service.js";
import { StructuredLoggerService } from "../logging/structured-logger.service.js";
import type { Logger } from "@keidai/shared";
import { IdentityDeniedError } from "../identity/types/identity-denied.js";
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
import { runWithMcpSessionId } from "./mcp-session-context.js";
import type { McpSessionEntry } from "./mcp-session-registry.service.js";
import { McpSessionRegistry } from "./mcp-session-registry.service.js";
import {
  mcpIdentityDeniedError,
  mcpInternalServerError,
  mcpInvalidSessionIdError,
  mcpNoSessionIdError,
  mcpSessionNotFoundError,
  mcpSessionPrincipalMismatchError,
  sendMcpHttpError,
  type McpJsonRpcErrorBody,
} from "./utils/mcp-http-errors.js";
import { parseInboundMcpRequest } from "./utils/parse-inbound-mcp-request.js";
import { readMcpSessionId } from "./utils/read-mcp-session-id.js";

function principalsMatch(
  left: AgentPrincipal,
  right: AgentPrincipal,
): boolean {
  return (
    left.agentId === right.agentId &&
    left.ownerId === right.ownerId &&
    left.groups.length === right.groups.length &&
    left.groups.every((group, index) => group === right.groups[index])
  );
}

type SessionAccessResult =
  | { ok: true; session: McpSessionEntry; sessionId: string }
  | { ok: false; statusCode: number; body: McpJsonRpcErrorBody };

@injectable()
export class GatewayMcpServer {
  constructor(
    @inject(ToolCatalogService)
    private readonly toolCatalog: ToolCatalogService,
    @inject(ToolDispatchService)
    private readonly toolDispatch: ToolDispatchService,
    @inject(InboundIdentityService)
    private readonly inboundIdentity: InboundIdentityService,
    @inject(TraceEmitterService)
    private readonly traceEmitter: TraceEmitter,
    @inject(StructuredLoggerService)
    private readonly logger: Logger,
    @inject(McpSessionRegistry)
    private readonly sessionRegistry: McpSessionRegistry,
  ) {}

  registerRoutes(app: FastifyInstance): void {
    app.post("/mcp", async (request, reply) => {
      await this.handlePost(request, reply);
    });

    app.get("/mcp", async (request, reply) => {
      await this.handleGet(request, reply);
    });

    app.delete("/mcp", async (request, reply) => {
      await this.handleDelete(request, reply);
    });
  }

  private async handlePost(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const mcpRequest = parseInboundMcpRequest(request.body);
    const sessionId = readMcpSessionId(request);

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
    const principal = principalResult.principal;

    const existingSession = sessionId
      ? this.sessionRegistry.get(sessionId)
      : undefined;

    if (sessionId && !existingSession) {
      sendMcpHttpError(reply, 404, mcpSessionNotFoundError(mcpRequest.id));
      return;
    }

    if (existingSession && !principalsMatch(existingSession.principal, principal)) {
      sendMcpHttpError(
        reply,
        403,
        mcpSessionPrincipalMismatchError(mcpRequest.id),
      );
      return;
    }

    if (!sessionId && !isInitializeRequest(request.body)) {
      sendMcpHttpError(reply, 400, mcpNoSessionIdError(mcpRequest.id));
      return;
    }

    if (existingSession) {
      await this.handleSessionRequest(
        existingSession.transport,
        sessionId!,
        principal,
        request,
        reply,
      );
      return;
    }

    const mcpServer = this.createMcpServer();
    let transport!: StreamableHTTPServerTransport;

    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (initializedSessionId) => {
        this.sessionRegistry.register(initializedSessionId, {
          transport,
          mcpServer,
          principal,
        });
        this.logger.info("mcp.session_open", {
          sessionId: initializedSessionId,
          agentId: principal.agentId,
        });
      },
      onsessionclosed: (closedSessionId) => {
        this.sessionRegistry.remove(closedSessionId);
        this.logger.info("mcp.session_close", {
          sessionId: closedSessionId,
          reason: "delete",
        });
      },
    });

    transport.onclose = () => {
      const closedSessionId = transport.sessionId;
      if (closedSessionId) {
        this.sessionRegistry.remove(closedSessionId);
        this.logger.info("mcp.session_close", {
          sessionId: closedSessionId,
          reason: "transport_close",
        });
      }
      void mcpServer.close();
    };

    try {
      await mcpServer.connect(transport);
      await runWithAgentPrincipal(principal, async () => {
        await transport.handleRequest(request.raw, reply.raw, request.body);
        reply.hijack();
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Internal server error";
      this.logger.error("mcp.request_error", { error: message });
      if (!reply.raw.headersSent) {
        sendMcpHttpError(
          reply,
          500,
          mcpInternalServerError(mcpRequest.id),
        );
      }
    }
  }

  private async handleGet(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    await this.handleStatefulSessionRequest(request, reply);
  }

  private async handleDelete(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    await this.handleStatefulSessionRequest(request, reply);
  }

  private async handleStatefulSessionRequest(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const sessionId = readMcpSessionId(request);
    const principalResult = await this.resolvePrincipal(request);
    if (!principalResult.ok) {
      sendMcpHttpError(
        reply,
        401,
        mcpIdentityDeniedError(null, principalResult.message),
      );
      return;
    }

    const sessionAccess = this.resolveRegisteredSession(
      sessionId,
      principalResult.principal,
      null,
    );
    if (!sessionAccess.ok) {
      sendMcpHttpError(reply, sessionAccess.statusCode, sessionAccess.body);
      return;
    }

    await this.handleSessionRequest(
      sessionAccess.session.transport,
      sessionAccess.sessionId,
      principalResult.principal,
      request,
      reply,
    );
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

  private resolveRegisteredSession(
    sessionId: string | undefined,
    principal: AgentPrincipal,
    requestId: string | number | null,
  ): SessionAccessResult {
    if (!sessionId) {
      return {
        ok: false,
        statusCode: 400,
        body: mcpInvalidSessionIdError(requestId),
      };
    }

    const session = this.sessionRegistry.get(sessionId);
    if (!session) {
      return {
        ok: false,
        statusCode: 400,
        body: mcpInvalidSessionIdError(requestId),
      };
    }

    if (!principalsMatch(session.principal, principal)) {
      return {
        ok: false,
        statusCode: 403,
        body: mcpSessionPrincipalMismatchError(requestId),
      };
    }

    return { ok: true, session, sessionId };
  }

  private async handleSessionRequest(
    transport: StreamableHTTPServerTransport,
    sessionId: string,
    principal: AgentPrincipal,
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    await runWithAgentPrincipal(principal, async () =>
      runWithMcpSessionId(sessionId, async () => {
        await transport.handleRequest(
          request.raw,
          reply.raw,
          request.method === "POST" ? request.body : undefined,
        );
        reply.hijack();
      }),
    );
  }

  private emitIdentityFailureTrace(
    mcpRequest: ReturnType<typeof parseInboundMcpRequest>,
    error: string,
  ): void {
    if (mcpRequest.method !== "tools/call" || !mcpRequest.toolName) {
      return;
    }

    const parsed = parseNamespacedToolName(mcpRequest.toolName);
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
    const mcpServer = new McpServer(
      { name: "torii-gateway", version: "0.0.0" },
      { capabilities: { tools: {} } },
    );

    mcpServer.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: await this.toolCatalog.listToolsForAgent(),
    }));

    mcpServer.server.setRequestHandler(
      CallToolRequestSchema,
      async (request) => {
        try {
          return await this.toolDispatch.callTool(
            request.params.name,
            request.params.arguments,
          );
        } catch (error) {
          throw this.toMcpError(error);
        }
      },
    );

    return mcpServer;
  }

  private toMcpError(error: unknown): McpError {
    if (error instanceof McpError) {
      return error;
    }
    if (error instanceof IdentityDeniedError) {
      return McpError.fromError(ErrorCode.InvalidRequest, error.message);
    }
    if (error instanceof PolicyDeniedError) {
      return McpError.fromError(ErrorCode.InvalidRequest, error.message);
    }
    if (error instanceof ToolNotFoundError) {
      return McpError.fromError(ErrorCode.InvalidParams, error.message);
    }
    if (error instanceof BackendUnavailableError) {
      return McpError.fromError(ErrorCode.InvalidRequest, error.message);
    }
    if (error instanceof LinkingRequiredError) {
      return McpError.fromError(ErrorCode.InvalidRequest, error.message);
    }
    if (error instanceof CredentialResolutionError) {
      return McpError.fromError(ErrorCode.InvalidRequest, error.message);
    }
    if (error instanceof Error) {
      return McpError.fromError(ErrorCode.InternalError, error.message);
    }
    return McpError.fromError(ErrorCode.InternalError, String(error));
  }
}
