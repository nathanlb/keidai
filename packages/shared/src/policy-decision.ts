/** Outcome of a policy evaluation on a tool call. */
export const PolicyDecision = {
  Allowed: "allowed",
  Denied: "denied",
} as const;

export type PolicyDecision =
  (typeof PolicyDecision)[keyof typeof PolicyDecision];
