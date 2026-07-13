import { PolicyDecision, type AgentPrincipal, type ServerConfig } from "@keidai/shared";
import { inject, injectable } from "tsyringe";
import { ToriiConfigService } from "../config/torii-config.service.js";
import { StructuredLoggerService } from "../logging/structured-logger.service.js";
import type { Logger } from "@keidai/shared";
import type { PolicyEvaluator } from "./types/policy-evaluator.js";
import { evaluatePolicy } from "./utils/evaluate-policy.js";

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
        this.logger.warn("policy.unknown_tool", {
          server: server.name,
          tool: toolName,
        });
      }
    }
  }
}
