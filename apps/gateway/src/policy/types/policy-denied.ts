export class PolicyDeniedError extends Error {
  readonly code = "policy_denied" as const;

  constructor(readonly toolName: string) {
    super(`policy_denied: ${toolName}`);
    this.name = "PolicyDeniedError";
  }
}
