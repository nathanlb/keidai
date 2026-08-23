import type { AgentPrincipal } from "@keidai/shared";
import { inject, injectable } from "tsyringe";
import { StructuredLoggerService } from "../logging/structured-logger.service.js";
import type { Logger } from "@keidai/shared";
import { GroupPolicyCache } from "./group-policy-cache.service.js";
import type { PolicyEvaluation } from "./types/policy-evaluation.js";
import type { PolicyEvaluator } from "./types/policy-evaluator.js";
import {
  evaluatePolicy,
  isToolGrantedByAnyGroup,
} from "./utils/evaluate-policy.js";

@injectable()
export class PolicyEnforcementService implements PolicyEvaluator {
  constructor(
    @inject(GroupPolicyCache)
    private readonly groupPolicies: GroupPolicyCache,
    @inject(StructuredLoggerService)
    private readonly logger: Logger,
  ) {}

  evaluate(
    principal: AgentPrincipal | undefined,
    server: string,
    tool: string,
  ): PolicyEvaluation {
    const groups = this.groupPolicies.get();
    const evaluation = evaluatePolicy(principal, groups, server, tool);

    if (
      evaluation.decision === "denied" &&
      evaluation.reason?.startsWith("unknown_group:")
    ) {
      const unknown = evaluation.reason.slice("unknown_group:".length).trim();
      for (const group of unknown.split(",").filter(Boolean)) {
        this.logger.warn("policy.unknown_group", {
          group,
          server,
          tool,
          agentId: principal?.agentId,
        });
      }
    }

    return evaluation;
  }

  isConfiguredGrant(server: string, tool: string): boolean {
    return isToolGrantedByAnyGroup(this.groupPolicies.get(), server, tool);
  }

  warnUnknownPolicyTools(
    server: string,
    backendToolNames: readonly string[],
  ): void {
    const knownTools = new Set(backendToolNames);
    const configuredTools = new Set<string>();

    for (const group of this.groupPolicies.get()) {
      for (const policy of group.servers) {
        if (policy.server !== server) {
          continue;
        }
        for (const toolName of [
          ...policy.allow,
          ...policy.deny,
          ...policy.gated,
        ]) {
          configuredTools.add(toolName);
        }
      }
    }

    for (const toolName of configuredTools) {
      if (!knownTools.has(toolName)) {
        this.logger.warn("policy.unknown_tool", {
          server,
          tool: toolName,
        });
      }
    }
  }
}
