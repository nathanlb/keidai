import type { AgentPrincipal } from "@keidai/shared";
import type { PolicyEvaluation } from "./policy-evaluation.js";

export interface PolicyEvaluator {
  evaluate(
    principal: AgentPrincipal | undefined,
    server: string,
    tool: string,
  ): PolicyEvaluation;

  /** True when any defined group grants this server/tool (catalog membership). */
  isConfiguredGrant(server: string, tool: string): boolean;

  warnUnknownPolicyTools(
    server: string,
    backendToolNames: readonly string[],
  ): void;
}
