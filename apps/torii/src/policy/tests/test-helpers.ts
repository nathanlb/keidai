import type { GroupDefinitionConfig } from "@keidai/shared";
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
import { buildGroupPolicies } from "../utils/build-group-policies.js";

export function groupPolicyCacheFromDefinitions(
  groups: GroupDefinitionConfig[] = [],
  gatedTools?: Record<string, string[]>,
): GroupPolicyCache {
  return GroupPolicyCache.fromGroups(
    buildGroupPolicies({ groups, gatedTools }),
  );
}

export function createPolicyEnforcement(
  groups: GroupDefinitionConfig[] = [],
  gatedTools?: Record<string, string[]>,
): PolicyEnforcementService {
  return new PolicyEnforcementService(
    groupPolicyCacheFromDefinitions(groups, gatedTools),
    createNoopLogger(),
  );
}

export async function createApprovalServices(
  groups: GroupDefinitionConfig[] = [],
  persistence?: TestGatewayPersistence,
  groupPolicies?: GroupPolicyCache,
  gatedTools?: Record<string, string[]>,
) {
  const ownedPersistence = persistence === undefined;
  const gatewayPersistence =
    persistence ?? (await createTestGatewayPersistence("postgres"));
  const cache =
    groupPolicies ?? groupPolicyCacheFromDefinitions(groups, gatedTools);
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
