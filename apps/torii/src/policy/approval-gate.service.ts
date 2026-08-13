import type { CallToolResult } from "@modelcontextprotocol/server";
import type { AgentPrincipal, McpCreateTaskResult } from "@keidai/shared";
import { toCreateTaskResult } from "@keidai/shared";
import { inject, injectable } from "tsyringe";
import { ToriiConfigService } from "../config/torii-config.service.js";
import { TaskStoreService } from "../tasks/task-store.service.js";
import { DEFAULT_MCP_TASK_TTL_MS } from "../tasks/types/mcp-task.js";
import { ApprovalStoreService, type ApprovalRecord } from "./approval-store.service.js";
import {
  hashToolParams,
  isGatedToolForAgent,
} from "./utils/approval-tool-args.js";
import { toApprovalDeniedToolResult } from "./utils/approval-tool-results.js";

export type GatedCallIntercept =
  | { kind: "denied"; result: CallToolResult }
  | { kind: "parked"; task: McpCreateTaskResult };

@injectable()
export class ApprovalGateService {
  private readonly gatedToolsByAgentId: Map<string, readonly string[]>;

  constructor(
    @inject(ToriiConfigService)
    configService: ToriiConfigService,
    @inject(ApprovalStoreService)
    private readonly approvalStore: ApprovalStoreService,
    @inject(TaskStoreService)
    private readonly taskStore: TaskStoreService,
  ) {
    this.gatedToolsByAgentId = new Map(
      Object.entries(configService.get().gated_tools ?? {}),
    );
  }

  requiresApproval(
    principal: AgentPrincipal | undefined,
    toolName: string,
  ): boolean {
    return isGatedToolForAgent(
      principal,
      this.gatedToolsByAgentId,
      toolName,
    );
  }

  interceptGatedCall(input: {
    principal: AgentPrincipal;
    toolName: string;
    upstreamArgs: Record<string, unknown>;
    runId?: string;
    stepId?: string;
    now?: number;
  }): GatedCallIntercept {
    const paramsHash = hashToolParams(input.upstreamArgs);
    const suppressed = this.approvalStore.findRecentRejection({
      agentId: input.principal.agentId,
      toolName: input.toolName,
      paramsHash,
      now: input.now,
    });

    if (suppressed) {
      return {
        kind: "denied",
        result: toApprovalDeniedToolResult(suppressed.rejectionReason),
      };
    }

    const now = input.now ?? Date.now();
    const ttlMs = DEFAULT_MCP_TASK_TTL_MS;
    const task = this.approvalStore.runInTransaction(() => {
      const created = this.taskStore.createWorkingTask({
        agentId: input.principal.agentId,
        ownerId: input.principal.ownerId,
        statusMessage: `Awaiting operator approval for ${input.toolName}`,
        ttlMs,
        now,
      });
      this.approvalStore.createPendingApproval({
        principal: input.principal,
        toolName: input.toolName,
        params: input.upstreamArgs,
        paramsHash,
        runId: input.runId,
        stepId: input.stepId,
        taskId: created.taskId,
        now,
        ttlMs,
      });
      return created;
    });

    return { kind: "parked", task: toCreateTaskResult(task) };
  }

  /**
   * Atomically claim an approved-but-unexecuted gated call. Returns undefined
   * when there is nothing to execute (still pending, already used, expired,
   * or not this agent's task).
   */
  claimApprovedExecution(
    taskId: string,
    principal: AgentPrincipal,
    now = Date.now(),
  ): ApprovalRecord | undefined {
    const record = this.approvalStore.getApprovalByTaskId(taskId);
    if (!record || record.agentId !== principal.agentId) {
      return undefined;
    }
    if (record.status !== "approved") {
      return undefined;
    }
    if (record.expiresAt <= now) {
      return undefined;
    }
    return this.approvalStore.markUsed(record.id, now);
  }

  cancelPendingForTask(taskId: string, now = Date.now()): void {
    const record = this.approvalStore.getApprovalByTaskId(taskId);
    if (record?.status !== "pending") {
      return;
    }
    this.approvalStore.cancel(record.id, now);
  }
}
