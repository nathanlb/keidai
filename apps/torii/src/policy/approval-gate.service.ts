import type { AgentPrincipal } from "@keidai/shared";
import { inject, injectable } from "tsyringe";
import { tryGetMcpSessionId } from "../mcp/mcp-session-context.js";
import { ToriiConfigService } from "../config/torii-config.service.js";
import { ApprovalStoreService } from "./approval-store.service.js";
import {
  hashToolParams,
  isGatedToolForAgent,
} from "./utils/approval-tool-args.js";
import {
  toApprovalDeniedToolResult,
  toApprovalRequiredToolResult,
} from "./utils/approval-tool-results.js";

export class ApprovalReplayError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApprovalReplayError";
  }
}

@injectable()
export class ApprovalGateService {
  private readonly gatedToolsByAgentId: Map<string, readonly string[]>;

  constructor(
    @inject(ToriiConfigService)
    configService: ToriiConfigService,
    @inject(ApprovalStoreService)
    private readonly approvalStore: ApprovalStoreService,
  ) {
    this.gatedToolsByAgentId = new Map(
      (configService.get().agents ?? []).map((agent) => [
        agent.agent_id,
        agent.gated_tools ?? [],
      ]),
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
  }) {
    const paramsHash = hashToolParams(input.upstreamArgs);
    const suppressed = this.approvalStore.findRecentRejection({
      agentId: input.principal.agentId,
      toolName: input.toolName,
      paramsHash,
      now: input.now,
    });

    if (suppressed) {
      return toApprovalDeniedToolResult(suppressed.rejectionReason);
    }

    const approval = this.approvalStore.createPendingApproval({
      principal: input.principal,
      toolName: input.toolName,
      params: input.upstreamArgs,
      paramsHash,
      runId: input.runId,
      stepId: input.stepId,
      mcpSessionId: tryGetMcpSessionId(),
      now: input.now,
    });

    return toApprovalRequiredToolResult(approval.id);
  }

  validateReplay(input: {
    approvalId: string;
    principal: AgentPrincipal;
    toolName: string;
    upstreamArgs: Record<string, unknown>;
    now?: number;
  }): void {
    const now = input.now ?? Date.now();
    const record = this.approvalStore.getApproval(input.approvalId);

    if (!record) {
      throw new ApprovalReplayError("approval not found");
    }
    if (record.status !== "approved") {
      throw new ApprovalReplayError(`approval is ${record.status}`);
    }
    if (record.usedAt !== undefined) {
      throw new ApprovalReplayError("approval already used");
    }
    if (record.expiresAt <= now) {
      throw new ApprovalReplayError("approval expired");
    }
    if (record.agentId !== input.principal.agentId) {
      throw new ApprovalReplayError("approval agent mismatch");
    }
    if (record.toolName !== input.toolName) {
      throw new ApprovalReplayError("approval tool mismatch");
    }
    if (record.paramsHash !== hashToolParams(input.upstreamArgs)) {
      throw new ApprovalReplayError("approval params mismatch");
    }
  }

  markReplayUsed(approvalId: string, now?: number): void {
    this.approvalStore.markUsed(approvalId, now);
  }
}
