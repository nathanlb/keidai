import type { ToriiConfig } from "@keidai/shared";
import { ToriiConfigService } from "../../config/torii-config.service.js";
import { McpSessionRegistry } from "../../mcp/mcp-session-registry.service.js";
import { createNoopLogger } from "../../logging/tests/test-helpers.js";
import { ApprovalGateService } from "../approval-gate.service.js";
import { ApprovalNotificationService } from "../approval-notification.service.js";
import { ApprovalReadService } from "../approval-read.service.js";
import { ApprovalStoreService } from "../approval-store.service.js";
import { ApprovalsApiController } from "../approvals-api.controller.js";
import { PolicyEnforcementService } from "../policy-enforcement.service.js";

export function createPolicyEnforcement(
  config: ToriiConfig | ToriiConfigService,
): PolicyEnforcementService {
  const configService =
    config instanceof ToriiConfigService
      ? config
      : new ToriiConfigService(config);
  return new PolicyEnforcementService(configService, createNoopLogger());
}

export function createApprovalServices(
  config: ToriiConfig | ToriiConfigService,
  sessionRegistry: McpSessionRegistry = new McpSessionRegistry(),
) {
  const configService =
    config instanceof ToriiConfigService
      ? config
      : new ToriiConfigService(config);
  const approvalStore = new ApprovalStoreService();
  const approvalGate = new ApprovalGateService(configService, approvalStore);
  const approvalRead = new ApprovalReadService(approvalStore);
  const approvalNotifications = new ApprovalNotificationService(
    sessionRegistry,
    createNoopLogger(),
  );
  const approvalsApi = new ApprovalsApiController(
    approvalRead,
    approvalStore,
    approvalNotifications,
  );

  return {
    approvalStore,
    approvalGate,
    approvalRead,
    approvalsApi,
    sessionRegistry,
    approvalNotifications,
  };
}

export type ApprovalServices = ReturnType<typeof createApprovalServices>;
