import type { ToriiConfig } from "@keidai/shared";
import { ToriiConfigService } from "../../config/torii-config.service.js";
import { createNoopLogger } from "../../logging/tests/test-helpers.js";
import {
  createTestGatewayPersistence,
  type TestGatewayPersistence,
} from "../../testing/gateway-persistence.js";
import { GroupPolicyCache } from "../group-policy-cache.service.js";
import { ApprovalGateService } from "../approval-gate.service.js";
import { ApprovalReadService } from "../approval-read.service.js";
import { ApprovalStoreService } from "../approval-store.service.js";
import { ApprovalsApiController } from "../approvals-api.controller.js";
import { PolicyEnforcementService } from "../policy-enforcement.service.js";
import { yamlConfigToGroupPolicies } from "../utils/yaml-config-to-group-policies.js";

export function groupPolicyCacheFromConfig(
  config: ToriiConfig | ToriiConfigService,
): GroupPolicyCache {
  const resolved =
    config instanceof ToriiConfigService ? config.get() : config;
  return GroupPolicyCache.fromGroups(yamlConfigToGroupPolicies(resolved));
}

export function createPolicyEnforcement(
  config: ToriiConfig | ToriiConfigService,
): PolicyEnforcementService {
  return new PolicyEnforcementService(
    groupPolicyCacheFromConfig(config),
    createNoopLogger(),
  );
}

export async function createApprovalServices(
  config: ToriiConfig | ToriiConfigService,
  persistence?: TestGatewayPersistence,
  groupPolicies?: GroupPolicyCache,
) {
  const ownedPersistence = persistence === undefined;
  const gatewayPersistence =
    persistence ?? (await createTestGatewayPersistence("postgres"));
  const configService =
    config instanceof ToriiConfigService
      ? config
      : new ToriiConfigService(config);
  const cache = groupPolicies ?? groupPolicyCacheFromConfig(configService);
  const approvalStore =
    gatewayPersistence.approvalStore ??
    new ApprovalStoreService(gatewayPersistence.pool!);
  const taskStore = gatewayPersistence.taskStore!;
  const approvalGate = new ApprovalGateService(
    cache,
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
