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

export async function createApprovalServices(
  config: ToriiConfig | ToriiConfigService,
  persistence?: TestGatewayPersistence,
) {
  const ownedPersistence = persistence === undefined;
  const gatewayPersistence =
    persistence ?? (await createTestGatewayPersistence("postgres"));
  const configService =
    config instanceof ToriiConfigService
      ? config
      : new ToriiConfigService(config);
  const approvalStore =
    gatewayPersistence.approvalStore ??
    new ApprovalStoreService(gatewayPersistence.pool!);
  const taskStore = gatewayPersistence.taskStore!;
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
    persistence: gatewayPersistence,
    close: async () => {
      if (ownedPersistence) {
        await gatewayPersistence.close();
      }
    },
  };
}

export type ApprovalServices = Awaited<ReturnType<typeof createApprovalServices>>;
