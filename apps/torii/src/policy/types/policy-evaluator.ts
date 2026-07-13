import type { AgentPrincipal, PolicyDecision, ServerConfig } from "@keidai/shared";

export interface PolicyEvaluator {
  evaluate(
    principal: AgentPrincipal | undefined,
    server: string,
    tool: string,
  ): PolicyDecision;

  warnUnknownPolicyTools(
    server: ServerConfig,
    backendToolNames: readonly string[],
  ): void;
}
