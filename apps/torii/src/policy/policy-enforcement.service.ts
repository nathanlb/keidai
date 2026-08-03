import type { AgentPrincipal } from "@keidai/shared";
import { inject, injectable } from "tsyringe";
import { ToriiConfigService } from "../config/torii-config.service.js";
import { StructuredLoggerService } from "../logging/structured-logger.service.js";
import type { Logger } from "@keidai/shared";
import type { PolicyEvaluation } from "./types/policy-evaluation.js";
import type { PolicyEvaluator } from "./types/policy-evaluator.js";
import {
  evaluatePolicy,
  isToolGrantedByAnyGroup,
} from "./utils/evaluate-policy.js";

@injectable()
export class PolicyEnforcementService implements PolicyEvaluator {
  constructor(
    @inject(ToriiConfigService)
    private readonly configService: ToriiConfigService,
    @inject(StructuredLoggerService)
    private readonly logger: Logger,
  ) {}

  evaluate(
    principal: AgentPrincipal | undefined,
    server: string,
    tool: string,
  ): PolicyEvaluation {
    const config = this.configService.get();
    const groups = config.groups ?? [];
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
    return isToolGrantedByAnyGroup(
      this.configService.get().groups ?? [],
      server,
      tool,
    );
  }

  warnUnknownPolicyTools(
    server: string,
    backendToolNames: readonly string[],
  ): void {
    const knownTools = new Set(backendToolNames);
    const configuredTools = new Set<string>();

    for (const group of this.configService.get().groups ?? []) {
      for (const permission of group.permissions) {
        if (permission.server !== server) {
          continue;
        }
        for (const toolName of permission.tools) {
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
