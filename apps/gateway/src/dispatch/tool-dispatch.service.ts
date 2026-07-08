import {
  CallToolResultSchema,
  type CallToolResult,
} from "@modelcontextprotocol/sdk/types.js";
import type { AgentPrincipal, CallTracePrincipal } from "@keidai/shared";
import { PolicyDecision } from "@keidai/shared";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { inject, injectable } from "tsyringe";
import type { CatalogTool } from "../catalog/types/catalog-tool.js";
import { ConnectionManager } from "../connections/connection-manager.service.js";
import type { BackendConnection } from "../connections/types/backend-connection.js";
import { ToolCatalogService } from "../catalog/tool-catalog.service.js";
import { CredentialResolverService } from "../credentials/credential-resolver.service.js";
import {
  LinkingRequiredError,
  toLinkingRequiredToolResult,
} from "../credentials/types/credential-resolution.js";
import { getAgentPrincipal } from "../identity/agent-principal-context.js";
import { PolicyDeniedError } from "../policy/types/policy-denied.js";
import {
  ApprovalGateService,
  ApprovalReplayError,
} from "../policy/approval-gate.service.js";
import { PolicyEnforcementService } from "../policy/policy-enforcement.service.js";
import {
  parseToolArguments,
  type ParsedToolArguments,
} from "../policy/utils/approval-tool-args.js";
import type { TraceEmitter } from "../trace/types/trace-emitter.js";
import { TraceEmitterService } from "../trace/trace-emitter.service.js";
import {
  createTraceId,
  createTraceTimestamp,
  finalizeCallTrace,
  toTracePrincipal,
} from "../trace/utils/build-call-trace.js";
import { deriveCredentialRef } from "../trace/utils/derive-credential-ref.js";
import {
  parseNamespacedToolName,
} from "../trace/utils/parse-namespaced-tool-name.js";
import {
  BackendUnavailableError,
  ToolNotFoundError,
} from "./types/tool-dispatch.js";
import { formatBackendToolError } from "./utils/format-backend-tool-error.js";

type TraceFields = Omit<
  Parameters<typeof finalizeCallTrace>[0],
  "traceId" | "timestamp"
>;

interface DispatchCallContext {
  namespacedName: string;
  parsedArgs: ParsedToolArguments;
  parsed: ReturnType<typeof parseNamespacedToolName>;
  agentPrincipal: AgentPrincipal | undefined;
  principal: CallTracePrincipal | undefined;
  startedAt: number;
  emit: (fields: TraceFields) => void;
}

interface ConnectedBackendTarget {
  entry: CatalogTool;
  connection: BackendConnection & { client: Client };
  credentialRef: string | undefined;
}

@injectable()
export class ToolDispatchService {
  constructor(
    @inject(ToolCatalogService)
    private readonly toolCatalog: ToolCatalogService,
    @inject(ConnectionManager)
    private readonly connectionManager: ConnectionManager,
    @inject(CredentialResolverService)
    private readonly credentialResolver: CredentialResolverService,
    @inject(TraceEmitterService)
    private readonly traceEmitter: TraceEmitter,
    @inject(PolicyEnforcementService)
    private readonly policyEnforcement: PolicyEnforcementService,
    @inject(ApprovalGateService)
    private readonly approvalGate: ApprovalGateService,
  ) {}

  async callTool(
    namespacedName: string,
    args?: Record<string, unknown>,
  ): Promise<CallToolResult> {
    const ctx = this.createCallContext(namespacedName, args);

    this.enforcePolicyOrThrow(ctx);

    const gatedResult = this.tryHandleApprovalGate(ctx);
    if (gatedResult) {
      return gatedResult;
    }

    const target = this.resolveConnectedBackend(ctx);
    return this.proxyCallToBackend(ctx, target);
  }

  private createCallContext(
    namespacedName: string,
    args?: Record<string, unknown>,
  ): DispatchCallContext {
    const traceId = createTraceId();
    const timestamp = createTraceTimestamp();
    const agentPrincipal = getAgentPrincipal();

    return {
      namespacedName,
      parsedArgs: parseToolArguments(args),
      parsed: parseNamespacedToolName(namespacedName),
      agentPrincipal,
      principal: toTracePrincipal(agentPrincipal),
      startedAt: Date.now(),
      emit: (fields) => {
        this.traceEmitter.emit(
          finalizeCallTrace(fields, { traceId, timestamp }),
        );
      },
    };
  }

  private enforcePolicyOrThrow(ctx: DispatchCallContext): void {
    if (
      this.policyEnforcement.evaluate(
        ctx.agentPrincipal,
        ctx.parsed.server,
        ctx.parsed.tool,
      ) !== PolicyDecision.Denied
    ) {
      return;
    }

    ctx.emit({
      server: ctx.parsed.server,
      tool: ctx.parsed.tool,
      principal: ctx.principal,
      policyDecision: PolicyDecision.Denied,
      error: "policy denied",
    });
    throw new PolicyDeniedError(ctx.namespacedName);
  }

  private tryHandleApprovalGate(
    ctx: DispatchCallContext,
  ): CallToolResult | undefined {
    if (ctx.parsedArgs.approvalId) {
      this.validateApprovalReplay(ctx);
      return undefined;
    }

    if (
      !ctx.agentPrincipal ||
      !this.approvalGate.requiresApproval(
        ctx.agentPrincipal,
        ctx.namespacedName,
      )
    ) {
      return undefined;
    }

    const approvalResult = this.approvalGate.interceptGatedCall({
      principal: ctx.agentPrincipal,
      toolName: ctx.namespacedName,
      upstreamArgs: ctx.parsedArgs.upstreamArgs,
      runId: ctx.parsedArgs.runId,
    });

    ctx.emit({
      server: ctx.parsed.server,
      tool: ctx.parsed.tool,
      principal: ctx.principal,
      policyDecision: PolicyDecision.Allowed,
      durationMs: Date.now() - ctx.startedAt,
    });

    return approvalResult;
  }

  private validateApprovalReplay(ctx: DispatchCallContext): void {
    if (!ctx.agentPrincipal) {
      throw new ApprovalReplayError("approval replay requires agent identity");
    }

    try {
      this.approvalGate.validateReplay({
        approvalId: ctx.parsedArgs.approvalId!,
        principal: ctx.agentPrincipal,
        toolName: ctx.namespacedName,
        upstreamArgs: ctx.parsedArgs.upstreamArgs,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "approval replay failed";
      ctx.emit({
        server: ctx.parsed.server,
        tool: ctx.parsed.tool,
        principal: ctx.principal,
        policyDecision: PolicyDecision.Allowed,
        error: message,
      });
      throw error;
    }
  }

  private resolveConnectedBackend(
    ctx: DispatchCallContext,
  ): ConnectedBackendTarget {
    const entry = this.toolCatalog.findTool(ctx.namespacedName);
    if (!entry) {
      ctx.emit({
        server: ctx.parsed.server,
        tool: ctx.parsed.tool,
        principal: ctx.principal,
        policyDecision: PolicyDecision.Allowed,
        error: `Unknown tool: ${ctx.namespacedName}`,
      });
      throw new ToolNotFoundError(ctx.namespacedName);
    }

    const connection = this.connectionManager.get(entry.server);
    if (!connection || connection.state === "failed") {
      const reason =
        connection?.state === "failed"
          ? (connection.error?.message ?? "connection failed")
          : "not configured";
      ctx.emit({
        server: entry.server,
        tool: entry.bareName,
        principal: ctx.principal,
        credentialRef: connection
          ? deriveCredentialRef(connection.config, ctx.principal?.ownerId)
          : undefined,
        policyDecision: PolicyDecision.Allowed,
        error: `Backend "${entry.server}" is unavailable: ${reason}`,
      });
      throw new BackendUnavailableError(entry.server, reason);
    }

    if (!connection.client) {
      ctx.emit({
        server: entry.server,
        tool: entry.bareName,
        principal: ctx.principal,
        credentialRef: deriveCredentialRef(
          connection.config,
          ctx.principal?.ownerId,
        ),
        policyDecision: PolicyDecision.Allowed,
        error: `Backend "${entry.server}" is unavailable: not connected`,
      });
      throw new BackendUnavailableError(entry.server, "not connected");
    }

    return {
      entry,
      connection: { ...connection, client: connection.client },
      credentialRef: deriveCredentialRef(
        connection.config,
        ctx.principal?.ownerId,
      ),
    };
  }

  private async proxyCallToBackend(
    ctx: DispatchCallContext,
    target: ConnectedBackendTarget,
  ): Promise<CallToolResult> {
    const { entry, connection, credentialRef } = target;

    try {
      const resolved = await this.credentialResolver.resolve(connection.config);
      const result = (await connection.client.callTool(
        {
          name: entry.bareName,
          arguments: ctx.parsedArgs.upstreamArgs,
        },
        CallToolResultSchema,
      )) as CallToolResult;

      if (ctx.parsedArgs.approvalId) {
        this.approvalGate.markReplayUsed(ctx.parsedArgs.approvalId);
      }

      ctx.emit({
        server: entry.server,
        tool: entry.bareName,
        principal: ctx.principal,
        credentialRef: resolved.credentialRef ?? credentialRef,
        policyDecision: PolicyDecision.Allowed,
        durationMs: Date.now() - ctx.startedAt,
        ...(result.isError ? { error: formatBackendToolError(result) } : {}),
      });

      return result;
    } catch (error) {
      if (error instanceof LinkingRequiredError) {
        ctx.emit({
          server: entry.server,
          tool: entry.bareName,
          principal: ctx.principal,
          credentialRef,
          policyDecision: PolicyDecision.Allowed,
          error: error.message,
        });
        return toLinkingRequiredToolResult(error);
      }

      ctx.emit({
        server: entry.server,
        tool: entry.bareName,
        principal: ctx.principal,
        credentialRef,
        policyDecision: PolicyDecision.Allowed,
        durationMs: Date.now() - ctx.startedAt,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}
