import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { PolicyDecision } from "@keidai/shared";
import type { FastifyInstance } from "fastify";
import { inject, injectable } from "tsyringe";
import { ToolCatalogService } from "../catalog/tool-catalog.service.js";
import { CredentialResolutionError, LinkingRequiredError } from "../credentials/types/credential-resolution.js";
import { ToolDispatchService } from "../dispatch/tool-dispatch.service.js";
import { runWithAgentPrincipal } from "../identity/agent-principal-context.js";
import { InboundIdentityService } from "../identity/inbound-identity.service.js";
import { IdentityDeniedError } from "../identity/types/identity-denied.js";
import { IdentityResolutionError } from "../identity/types/identity-resolution-error.js";
import {
  BackendUnavailableError,
  ToolNotFoundError,
} from "../dispatch/types/tool-dispatch.js";
import { PolicyDeniedError } from "../policy/types/policy-denied.js";
import { TraceEmitterService } from "../trace/trace-emitter.service.js";
import {
  createTraceId,
  createTraceTimestamp,
  finalizeCallTrace,
} from "../trace/utils/build-call-trace.js";
import { parseNamespacedToolName } from "../trace/utils/parse-namespaced-tool-name.js";
import { parseInboundMcpRequest } from "./utils/parse-inbound-mcp-request.js";

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
    private readonly traceEmitter: TraceEmitterService,
  ) {}

  registerRoutes(app: FastifyInstance): void {
    app.post("/mcp", async (request, reply) => {
      const mcpRequest = parseInboundMcpRequest(request.body);

      let principal;
      try {
        principal = await this.inboundIdentity.resolveFromAuthorizationHeader(
          request.headers.authorization,
        );
      } catch (error) {
        const message =
          error instanceof IdentityResolutionError
            ? error.message
            : "Identity resolution failed";
        this.emitIdentityFailureTrace(mcpRequest, message);
        reply.code(401).send({
          jsonrpc: "2.0",
          error: {
            code: ErrorCode.InvalidRequest,
            message: `identity_denied: ${message}`,
          },
          id: mcpRequest.id,
        });
        return;
      }

      return runWithAgentPrincipal(principal, async () => {
        const mcpServer = this.createMcpServer();

        try {
          const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: undefined,
          });
          await mcpServer.connect(transport);
          await transport.handleRequest(request.raw, reply.raw, request.body);
          reply.hijack();

          request.raw.on("close", () => {
            void transport.close();
            void mcpServer.close();
          });
        } catch (error) {
          console.error("Error handling gateway MCP request:", error);
          if (!reply.raw.headersSent) {
            reply
              .code(500)
              .send({
                jsonrpc: "2.0",
                error: {
                  code: -32603,
                  message: "Internal server error",
                },
                id: mcpRequest.id,
              });
          }
        }
      });
    });

    app.get("/mcp", async (_request, reply) => {
      reply.code(405).send({
        jsonrpc: "2.0",
        error: {
          code: -32000,
          message: "Method not allowed.",
        },
        id: null,
      });
    });
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
