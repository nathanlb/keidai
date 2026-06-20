import { PolicyDecision, type AgentPrincipal, type ServerConfig } from "@torii/shared";
import { inject, injectable } from "tsyringe";
import { ToriiConfigService } from "../config/torii-config.service.js";
import type { PolicyEvaluator } from "./types/policy-evaluator.js";
import { evaluatePolicy } from "./utils/evaluate-policy.js";

@injectable()
export class PolicyEnforcementService implements PolicyEvaluator {
  constructor(
    @inject(ToriiConfigService)
    private readonly configService: ToriiConfigService,
  ) {}

  evaluate(
    principal: AgentPrincipal | undefined,
    server: string,
    tool: string,
  ): PolicyDecision {
    const serverConfig = this.configService
      .get()
      .servers.find((entry) => entry.name === server);

    if (!serverConfig) {
      return PolicyDecision.Denied;
    }

    return evaluatePolicy(principal, serverConfig.policy, tool);
  }

  warnUnknownPolicyTools(
    server: ServerConfig,
    backendToolNames: readonly string[],
  ): void {
    const knownTools = new Set(backendToolNames);
    const configuredTools = [
      ...(server.policy.allow ?? []),
      ...(server.policy.deny ?? []),
    ];

    for (const toolName of configuredTools) {
      if (!knownTools.has(toolName)) {
        console.warn(
          `Backend "${server.name}": policy references unknown tool "${toolName}"`,
        );
      }
    }
  }
}
