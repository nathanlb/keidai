import {
  CallToolResultSchema,
  type CallToolResult,
} from "@modelcontextprotocol/sdk/types.js";
import { PolicyDecision } from "@keidai/shared";
import { inject, injectable } from "tsyringe";
import { ConnectionManager } from "../backends/connection-manager.service.js";
import { ToolCatalogService } from "../catalog/tool-catalog.service.js";
import { CredentialResolverService } from "../credentials/credential-resolver.service.js";
import {
  CredentialResolutionError,
  LinkingRequiredError,
  toLinkingRequiredToolResult,
} from "../credentials/types/credential-resolution.js";
import { getAgentPrincipal } from "../identity/agent-principal-context.js";
import { PolicyDeniedError } from "../policy/types/policy-denied.js";
import { PolicyEnforcementService } from "../policy/policy-enforcement.service.js";
import type { TraceEmitter } from "../trace/types/trace-emitter.js";
import { TraceEmitterService } from "../trace/trace-emitter.service.js";
import {
  createTraceId,
  createTraceTimestamp,
  finalizeCallTrace,
  toTracePrincipal,
} from "../trace/utils/build-call-trace.js";
import { deriveCredentialRef } from "../trace/utils/derive-credential-ref.js";
import { parseNamespacedToolName } from "../trace/utils/parse-namespaced-tool-name.js";
import {
  BackendUnavailableError,
  ToolNotFoundError,
} from "./types/tool-dispatch.js";

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
  ) {}

  async callTool(
    namespacedName: string,
    args?: Record<string, unknown>,
  ): Promise<CallToolResult> {
    const traceId = createTraceId();
    const timestamp = createTraceTimestamp();
    const startedAt = Date.now();
    const agentPrincipal = getAgentPrincipal();
    const principal = toTracePrincipal(agentPrincipal);
    const parsed = parseNamespacedToolName(namespacedName);

    const emit = (
      fields: Omit<
        Parameters<typeof finalizeCallTrace>[0],
        "traceId" | "timestamp"
      >,
    ): void => {
      this.traceEmitter.emit(
        finalizeCallTrace(fields, { traceId, timestamp }),
      );
    };

    if (
      this.policyEnforcement.evaluate(
        agentPrincipal,
        parsed.server,
        parsed.tool,
      ) === PolicyDecision.Denied
    ) {
      emit({
        server: parsed.server,
        tool: parsed.tool,
        principal,
        policyDecision: PolicyDecision.Denied,
        error: "policy denied",
      });
      throw new PolicyDeniedError(namespacedName);
    }

    const entry = this.toolCatalog.findTool(namespacedName);
    if (!entry) {
      emit({
        server: parsed.server,
        tool: parsed.tool,
        principal,
        policyDecision: PolicyDecision.Allowed,
        error: `Unknown tool: ${namespacedName}`,
      });
      throw new ToolNotFoundError(namespacedName);
    }

    const connection = this.connectionManager.get(entry.server);
    if (!connection || connection.state === "failed") {
      const reason =
        connection?.state === "failed"
          ? (connection.error?.message ?? "connection failed")
          : "not configured";
      emit({
        server: entry.server,
        tool: entry.bareName,
        principal,
        credentialRef: connection
          ? deriveCredentialRef(connection.config, principal?.ownerId)
          : undefined,
        policyDecision: PolicyDecision.Allowed,
        error: `Backend "${entry.server}" is unavailable: ${reason}`,
      });
      throw new BackendUnavailableError(entry.server, reason);
    }

    if (!connection.client) {
      emit({
        server: entry.server,
        tool: entry.bareName,
        principal,
        credentialRef: deriveCredentialRef(
          connection.config,
          principal?.ownerId,
        ),
        policyDecision: PolicyDecision.Allowed,
        error: `Backend "${entry.server}" is unavailable: not connected`,
      });
      throw new BackendUnavailableError(entry.server, "not connected");
    }

    const credentialRef = deriveCredentialRef(
      connection.config,
      principal?.ownerId,
    );

    try {
      const resolved = await this.credentialResolver.resolve(connection.config);
      const result = (await connection.client.callTool(
        {
          name: entry.bareName,
          arguments: args,
        },
        CallToolResultSchema,
      )) as CallToolResult;

      emit({
        server: entry.server,
        tool: entry.bareName,
        principal,
        credentialRef: resolved.credentialRef ?? credentialRef,
        policyDecision: PolicyDecision.Allowed,
        durationMs: Date.now() - startedAt,
        ...(result.isError ? { error: "backend returned error result" } : {}),
      });

      return result;
    } catch (error) {
      if (error instanceof LinkingRequiredError) {
        emit({
          server: entry.server,
          tool: entry.bareName,
          principal,
          credentialRef,
          policyDecision: PolicyDecision.Allowed,
          error: error.message,
        });
        return toLinkingRequiredToolResult(error);
      }

      if (error instanceof CredentialResolutionError) {
        console.error(error.message);
      }

      emit({
        server: entry.server,
        tool: entry.bareName,
        principal,
        credentialRef,
        policyDecision: PolicyDecision.Allowed,
        durationMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}
