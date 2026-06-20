import type { AgentPrincipal, PolicyDecision, ServerConfig } from "@torii/shared";

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
