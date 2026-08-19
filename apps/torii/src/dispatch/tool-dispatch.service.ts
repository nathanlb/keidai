import type { CallToolResult, Client } from "@modelcontextprotocol/client";
import { ProtocolErrorCode } from "@modelcontextprotocol/server";
import type {
  AgentPrincipal,
  CallTracePrincipal,
  McpCreateTaskResult,
} from "@keidai/shared";
import {
  MCP_TASKS_CANCEL_METHOD,
  MCP_TASKS_GET_METHOD,
  PolicyDecision,
  TORII_RUN_ID_ARG,
  TORII_STEP_ID_ARG,
  isMcpTaskTerminalStatus,
  mcpGetTaskResultSchema,
  toCreateTaskResult,
} from "@keidai/shared";
import { inject, injectable } from "tsyringe";
import type { CatalogTool } from "../catalog/types/catalog-tool.js";
import { ConnectionManager } from "../connections/connection-manager.service.js";
import type { BackendConnection } from "../connections/types/backend-connection.js";
import { postBackendMcpJsonRpc } from "../connections/utils/post-backend-mcp.js";
import { ToolCatalogService } from "../catalog/tool-catalog.service.js";
import { CredentialResolverService } from "../credentials/credential-resolver.service.js";
import {
  LinkingRequiredError,
  toLinkingRequiredToolResult,
} from "../credentials/types/credential-resolution.js";
import { getAgentPrincipal } from "../identity/agent-principal-context.js";
import { PolicyDeniedError } from "../policy/types/policy-denied.js";
import { ApprovalGateService } from "../policy/approval-gate.service.js";
import { PolicyEnforcementService } from "../policy/policy-enforcement.service.js";
import { callToolResultToRecord } from "../policy/utils/approval-tool-results.js";
import {
  parseToolArguments,
  type ParsedToolArguments,
} from "../policy/utils/approval-tool-args.js";
import { TaskStoreService } from "../tasks/task-store.service.js";
import type { StoredMcpTask } from "../tasks/types/mcp-task.js";
import { toMcpTask } from "../tasks/utils/to-mcp-task.js";
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
import {
  classifyBackendToolResult,
  unsupportedBackendResultToolResult,
  BACKEND_INPUT_REQUIRED_MESSAGE,
  BACKEND_TASK_INPUT_REQUIRED_MESSAGE,
  unrecognizedBackendResultTypeMessage,
  backendTaskWithoutClientCapabilityMessage,
} from "./utils/classify-backend-tool-result.js";
import { formatBackendToolError } from "./utils/format-backend-tool-error.js";
import { isParkedTaskResult } from "./utils/is-parked-task-result.js";
import { withToriiTraceMeta } from "./utils/with-torii-trace-meta.js";

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
  traceId: string;
  emit: (fields: TraceFields) => Promise<void>;
}

interface ConnectedBackendTarget {
  entry: CatalogTool;
  connection: BackendConnection & { client: Client };
  credentialRef: string | undefined;
}

interface ProxyBackendOptions {
  clientDeclaresTasks?: boolean;
  existingTaskId?: string;
}

/** A gateway task that remints a backend task, so both origin fields are set. */
type BackendOriginTask = StoredMcpTask & {
  backendServer: string;
  backendTaskId: string;
};

function hasBackendOrigin(task: StoredMcpTask): task is BackendOriginTask {
  return task.backendServer !== undefined && task.backendTaskId !== undefined;
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
    @inject(TaskStoreService)
    private readonly taskStore: TaskStoreService,
  ) {}

  requiresApproval(toolName: string): boolean {
    return this.approvalGate.requiresApproval(getAgentPrincipal(), toolName);
  }

  async callTool(
    namespacedName: string,
    args?: Record<string, unknown>,
    options?: { clientDeclaresTasks?: boolean },
  ): Promise<CallToolResult | McpCreateTaskResult> {
    const ctx = this.createCallContext(namespacedName, args);

    await this.enforcePolicyOrThrow(ctx);

    const gatedResult = await this.tryHandleApprovalGate(ctx);
    if (gatedResult) {
      if (isParkedTaskResult(gatedResult)) {
        return gatedResult;
      }
      return withToriiTraceMeta(gatedResult, ctx.traceId);
    }

    const target = await this.resolveConnectedBackend(ctx);
    const result = await this.proxyCallToBackend(ctx, target, {
      clientDeclaresTasks: options?.clientDeclaresTasks === true,
    });
    return isParkedTaskResult(result)
      ? result
      : withToriiTraceMeta(result, ctx.traceId);
  }

  /**
   * Option A: when `tasks/get` finds an approved-but-unexecuted gated call,
   * proxy to the backend inline and complete the task. `markUsed` is the
   * single-use claim so concurrent polls cannot double-execute.
   *
   * If the backend itself returns a task, that origin is attached to this
   * same gateway task so the agent sees one lifecycle.
   */
  async executeApprovedTask(taskId: string): Promise<void> {
    const principal = getAgentPrincipal();
    if (!principal) {
      return;
    }

    const claimed = await this.approvalGate.claimApprovedExecution(taskId, principal);
    if (!claimed) {
      return;
    }

    const stored = await this.taskStore.getDetailedTask(principal.agentId, taskId);
    if (stored.status !== "working") {
      return;
    }

    const args: Record<string, unknown> = { ...claimed.params };
    if (claimed.runId) {
      args[TORII_RUN_ID_ARG] = claimed.runId;
    }
    if (claimed.stepId) {
      args[TORII_STEP_ID_ARG] = claimed.stepId;
    }

    const ctx = this.createCallContext(claimed.toolName, args);
    try {
      const target = await this.resolveConnectedBackend(ctx);
      const result = await this.proxyCallToBackend(ctx, target, {
        clientDeclaresTasks: true,
        existingTaskId: taskId,
      });
      if (isParkedTaskResult(result)) {
        return;
      }
      await this.taskStore.complete(taskId, callToolResultToRecord(result));
    } catch (error) {
      await this.taskStore.fail(taskId, {
        code: ProtocolErrorCode.InternalError,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async syncNonTerminalTask(taskId: string): Promise<void> {
    await this.executeApprovedTask(taskId);
    await this.syncBackendOriginatedTask(taskId);
  }

  async cancelPendingApprovalForTask(taskId: string): Promise<void> {
    await this.approvalGate.cancelPendingForTask(taskId);
  }

  async cancelParkedTask(taskId: string): Promise<void> {
    await this.cancelPendingApprovalForTask(taskId);
    await this.forwardBackendCancel(taskId);
  }

  private createCallContext(
    namespacedName: string,
    args?: Record<string, unknown>,
  ): DispatchCallContext {
    const traceId = createTraceId();
    const timestamp = createTraceTimestamp();
    const agentPrincipal = getAgentPrincipal();
    const parsedArgs = parseToolArguments(args);

    return {
      namespacedName,
      parsedArgs,
      parsed: parseNamespacedToolName(namespacedName),
      agentPrincipal,
      principal: toTracePrincipal(agentPrincipal),
      startedAt: Date.now(),
      traceId,
      emit: async (fields) => {
        await this.traceEmitter.emit(
          finalizeCallTrace(
            {
              ...fields,
              ...(parsedArgs.runId ? { runId: parsedArgs.runId } : {}),
              ...(parsedArgs.stepId ? { stepId: parsedArgs.stepId } : {}),
            },
            { traceId, timestamp },
          ),
        );
      },
    };
  }

  private async enforcePolicyOrThrow(ctx: DispatchCallContext): Promise<void> {
    const evaluation = this.policyEnforcement.evaluate(
      ctx.agentPrincipal,
      ctx.parsed.server,
      ctx.parsed.tool,
    );
    if (evaluation.decision !== PolicyDecision.Denied) {
      return;
    }

    await ctx.emit({
      server: ctx.parsed.server,
      tool: ctx.parsed.tool,
      principal: ctx.principal,
      policyDecision: PolicyDecision.Denied,
      error: evaluation.reason ?? "policy denied",
    });
    throw new PolicyDeniedError(ctx.namespacedName);
  }

  private async tryHandleApprovalGate(
    ctx: DispatchCallContext,
  ): Promise<CallToolResult | McpCreateTaskResult | undefined> {
    if (
      !ctx.agentPrincipal ||
      !this.approvalGate.requiresApproval(
        ctx.agentPrincipal,
        ctx.namespacedName,
      )
    ) {
      return undefined;
    }

    const intercepted = await this.approvalGate.interceptGatedCall({
      principal: ctx.agentPrincipal,
      toolName: ctx.namespacedName,
      upstreamArgs: ctx.parsedArgs.upstreamArgs,
      runId: ctx.parsedArgs.runId,
      stepId: ctx.parsedArgs.stepId,
    });

    await ctx.emit({
      server: ctx.parsed.server,
      tool: ctx.parsed.tool,
      principal: ctx.principal,
      policyDecision: PolicyDecision.Allowed,
      durationMs: Date.now() - ctx.startedAt,
    });

    return intercepted.kind === "parked" ? intercepted.task : intercepted.result;
  }

  private async resolveConnectedBackend(
    ctx: DispatchCallContext,
  ): Promise<ConnectedBackendTarget> {
    const entry = this.toolCatalog.findTool(ctx.namespacedName);
    if (!entry) {
      await ctx.emit({
        server: ctx.parsed.server,
        tool: ctx.parsed.tool,
        principal: ctx.principal,
        policyDecision: PolicyDecision.Allowed,
        error: `Unknown tool: ${ctx.namespacedName}`,
      });
      throw new ToolNotFoundError(ctx.namespacedName);
    }

    let connection = this.connectionManager.get(entry.server);
    if (
      !connection ||
      connection.state === "failed" ||
      !connection.client
    ) {
      // Retry once with the current agent principal so user_oauth handshakes
      // can attach Authorization after a principal-less boot failure.
      try {
        connection = await this.connectionManager.ensureConnected(entry.server);
      } catch (error) {
        const reason =
          error instanceof Error ? error.message : "connection failed";
        await ctx.emit({
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
    }

    if (!connection || connection.state === "failed") {
      const reason =
        connection?.state === "failed"
          ? (connection.error?.message ?? "connection failed")
          : "not configured";
      await ctx.emit({
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
      await ctx.emit({
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
    options: ProxyBackendOptions = {},
  ): Promise<CallToolResult | McpCreateTaskResult> {
    const { entry, connection, credentialRef } = target;

    try {
      const resolved = await this.credentialResolver.resolve(connection.config);
      const raw = await postBackendMcpJsonRpc({
        url: backendHttpUrl(connection),
        method: "tools/call",
        params: {
          name: entry.bareName,
          arguments: ctx.parsedArgs.upstreamArgs,
        },
        headers: resolved.headers,
        protocolVersion: connection.client.getNegotiatedProtocolVersion(),
      });
      const classified = classifyBackendToolResult(raw);

      if (classified.kind === "complete") {
        await ctx.emit({
          server: entry.server,
          tool: entry.bareName,
          principal: ctx.principal,
          credentialRef: resolved.credentialRef ?? credentialRef,
          policyDecision: PolicyDecision.Allowed,
          durationMs: Date.now() - ctx.startedAt,
          ...(classified.value.isError
            ? { error: formatBackendToolError(classified.value) }
            : {}),
        });
        return classified.value;
      }

      if (classified.kind === "task") {
        return this.adoptBackendTask(ctx, target, classified.value, {
          ...options,
          credentialRef: resolved.credentialRef ?? credentialRef,
        });
      }

      const message =
        classified.kind === "input_required"
          ? BACKEND_INPUT_REQUIRED_MESSAGE
          : unrecognizedBackendResultTypeMessage(classified.resultType);
      await ctx.emit({
        server: entry.server,
        tool: entry.bareName,
        principal: ctx.principal,
        credentialRef: resolved.credentialRef ?? credentialRef,
        policyDecision: PolicyDecision.Allowed,
        durationMs: Date.now() - ctx.startedAt,
        error: message,
      });
      return unsupportedBackendResultToolResult(message);
    } catch (error) {
      if (error instanceof LinkingRequiredError) {
        await ctx.emit({
          server: entry.server,
          tool: entry.bareName,
          principal: ctx.principal,
          credentialRef,
          policyDecision: PolicyDecision.Allowed,
          error: error.message,
        });
        return toLinkingRequiredToolResult(error);
      }

      await ctx.emit({
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

  private async adoptBackendTask(
    ctx: DispatchCallContext,
    target: ConnectedBackendTarget,
    backendTask: McpCreateTaskResult,
    options: ProxyBackendOptions & { credentialRef?: string },
  ): Promise<CallToolResult | McpCreateTaskResult> {
    const { entry } = target;

    if (!options.clientDeclaresTasks && !options.existingTaskId) {
      return this.rejectBackendTask(
        ctx,
        target,
        backendTask,
        options,
        backendTaskWithoutClientCapabilityMessage(),
      );
    }

    if (!ctx.agentPrincipal) {
      return this.rejectBackendTask(
        ctx,
        target,
        backendTask,
        options,
        "Backend returned a task but the call has no agent principal",
      );
    }

    const statusMessage = `Waiting on ${entry.server} task`;
    const origin = {
      server: entry.server,
      backendTaskId: backendTask.taskId,
      pollIntervalMs: backendTask.pollIntervalMs,
      statusMessage,
    };

    const stored = options.existingTaskId
      ? await this.taskStore.attachBackendOrigin(options.existingTaskId, origin)
      : await this.taskStore.attachBackendOrigin(
          (
            await this.taskStore.createWorkingTask({
              agentId: ctx.agentPrincipal.agentId,
              ownerId: ctx.agentPrincipal.ownerId,
              statusMessage,
              pollIntervalMs: backendTask.pollIntervalMs,
              ttlMs: backendTask.ttlMs,
            })
          ).taskId,
          origin,
        );

    if (!stored) {
      // The gateway task went terminal under us — typically an agent cancel
      // racing the backend call — so nothing would ever poll this origin.
      return this.rejectBackendTask(
        ctx,
        target,
        backendTask,
        options,
        "Failed to persist backend-originated task",
      );
    }

    await ctx.emit({
      server: entry.server,
      tool: entry.bareName,
      principal: ctx.principal,
      credentialRef: options.credentialRef,
      policyDecision: PolicyDecision.Allowed,
      durationMs: Date.now() - ctx.startedAt,
      taskId: stored.taskId,
      backendTaskId: backendTask.taskId,
    });
    return toCreateTaskResult(toMcpTask(stored));
  }

  /**
   * Refuse a backend task Torii cannot hand to the agent, cancelling upstream so
   * the backend is not left working on a task nobody will poll.
   */
  private async rejectBackendTask(
    ctx: DispatchCallContext,
    target: ConnectedBackendTarget,
    backendTask: McpCreateTaskResult,
    options: { credentialRef?: string },
    message: string,
  ): Promise<CallToolResult> {
    await ctx.emit({
      server: target.entry.server,
      tool: target.entry.bareName,
      principal: ctx.principal,
      credentialRef: options.credentialRef,
      policyDecision: PolicyDecision.Allowed,
      durationMs: Date.now() - ctx.startedAt,
      error: message,
      backendTaskId: backendTask.taskId,
    });
    await this.postBackendCancel(target.entry.server, backendTask.taskId);
    return unsupportedBackendResultToolResult(message);
  }

  /**
   * The stored task when it is a reminted handle on a backend task.
   *
   * Absent for plain gateway tasks and for lookups that lose the ownership or
   * TTL check — both sync paths run off the back of a `tasks/*` request that
   * already reported those failures to the agent.
   */
  private async findBackendOriginTask(
    taskId: string,
  ): Promise<BackendOriginTask | undefined> {
    const principal = getAgentPrincipal();
    if (!principal) {
      return undefined;
    }
    let stored: StoredMcpTask;
    try {
      stored = await this.taskStore.requireOwnedTask(principal.agentId, taskId);
    } catch {
      return undefined;
    }
    return hasBackendOrigin(stored) ? stored : undefined;
  }

  private async syncBackendOriginatedTask(taskId: string): Promise<void> {
    const stored = await this.findBackendOriginTask(taskId);
    if (!stored || isMcpTaskTerminalStatus(stored.status)) {
      return;
    }

    const connection = await this.connectionManager.ensureConnected(
      stored.backendServer,
    );
    if (!connection.client || connection.config.transport.type !== "http") {
      await this.taskStore.fail(taskId, {
        code: ProtocolErrorCode.InternalError,
        message: `Backend "${stored.backendServer}" is unavailable`,
      });
      return;
    }

    const resolved = await this.credentialResolver.resolve(connection.config);
    let raw: Record<string, unknown>;
    try {
      raw = await postBackendMcpJsonRpc({
        url: connection.config.transport.url,
        method: MCP_TASKS_GET_METHOD,
        params: { taskId: stored.backendTaskId },
        headers: resolved.headers,
        protocolVersion: connection.client.getNegotiatedProtocolVersion(),
      });
    } catch (error) {
      await this.taskStore.fail(taskId, {
        code: ProtocolErrorCode.InternalError,
        message: error instanceof Error ? error.message : String(error),
      });
      return;
    }

    const parsed = mcpGetTaskResultSchema.safeParse(raw);
    if (!parsed.success) {
      await this.abandonBackendTask(
        stored,
        unrecognizedBackendResultTypeMessage(
          typeof raw.resultType === "string" ? raw.resultType : "invalid",
        ),
      );
      return;
    }

    const backend = parsed.data;
    switch (backend.status) {
      case "working":
        await this.taskStore.attachBackendOrigin(taskId, {
          server: stored.backendServer,
          backendTaskId: stored.backendTaskId,
          pollIntervalMs: backend.pollIntervalMs,
          statusMessage: stored.statusMessage,
        });
        return;
      case "input_required":
        await this.abandonBackendTask(stored, BACKEND_TASK_INPUT_REQUIRED_MESSAGE);
        return;
      case "completed":
        await this.taskStore.complete(taskId, backend.result);
        return;
      case "failed":
        await this.taskStore.fail(taskId, backend.error);
        return;
      case "cancelled":
        await this.taskStore.requestCancel(stored.agentId, taskId);
        return;
    }
  }

  /**
   * Give up on a backend task Torii cannot drive to a terminal result, and tell
   * the backend to stop so it is not left working on an unreadable task.
   */
  private async abandonBackendTask(
    stored: BackendOriginTask,
    message: string,
  ): Promise<void> {
    await this.taskStore.complete(
      stored.taskId,
      callToolResultToRecord(unsupportedBackendResultToolResult(message)),
    );
    await this.postBackendCancel(stored.backendServer, stored.backendTaskId);
  }

  private async forwardBackendCancel(taskId: string): Promise<void> {
    const stored = await this.findBackendOriginTask(taskId);
    if (!stored) {
      return;
    }
    await this.postBackendCancel(stored.backendServer, stored.backendTaskId);
  }

  /**
   * Cooperative `tasks/cancel`. Failures are swallowed: the gateway task is
   * already terminal, and the backend's own TTL is the backstop.
   */
  private async postBackendCancel(
    server: string,
    backendTaskId: string,
  ): Promise<void> {
    try {
      const connection = await this.connectionManager.ensureConnected(server);
      if (connection.config.transport.type !== "http" || !connection.client) {
        return;
      }
      const resolved = await this.credentialResolver.resolve(connection.config);
      await postBackendMcpJsonRpc({
        url: connection.config.transport.url,
        method: MCP_TASKS_CANCEL_METHOD,
        params: { taskId: backendTaskId },
        headers: resolved.headers,
        protocolVersion: connection.client.getNegotiatedProtocolVersion(),
      });
    } catch {
      // Best effort; the gateway task is already terminal either way.
    }
  }
}

function backendHttpUrl(connection: BackendConnection): string {
  if (connection.config.transport.type !== "http") {
    throw new Error(
      `Unsupported transport type for server "${connection.config.name}"`,
    );
  }
  return connection.config.transport.url;
}
