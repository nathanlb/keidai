import type { PolicyDecision } from "@keidai/shared";

export interface PolicyEvaluation {
  decision: PolicyDecision;
  /** Set when denied — surfaced on the call trace. */
  reason?: string;
}
