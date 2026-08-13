import type { ToriiConfig } from "@keidai/shared";
import { ToriiConfigService } from "../../config/torii-config.service.js";
import { createNoopLogger } from "../../logging/tests/test-helpers.js";
import {
  createTestGatewayPersistence,
  type TestGatewayPersistence,
} from "../../testing/gateway-persistence.js";
import { ApprovalGateService } from "../approval-gate.service.js";
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
  persistence: TestGatewayPersistence = createTestGatewayPersistence("sqlite"),
) {
  const configService =
    config instanceof ToriiConfigService
      ? config
      : new ToriiConfigService(config);
  const approvalStore =
    persistence.approvalStore ??
    new ApprovalStoreService(persistence.database!);
  const taskStore = persistence.taskStore!;
  const approvalGate = new ApprovalGateService(
    configService,
    approvalStore,
    taskStore,
  );
  const approvalRead = new ApprovalReadService(approvalStore);
  const approvalsApi = new ApprovalsApiController(
    approvalRead,
    approvalStore,
    taskStore,
  );

  return {
    approvalStore,
    approvalGate,
    approvalRead,
    approvalsApi,
    taskStore,
    persistence,
    close: persistence.close,
  };
}

export type ApprovalServices = ReturnType<typeof createApprovalServices>;
