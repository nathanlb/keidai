/**
 * Torii rejected a tools/call under group policy. Distinct from transport
 * failures so resume/replay can terminate as failed(reason) with a clear cause.
 */
export class PolicyDeniedError extends Error {
  readonly code = "policy_denied" as const;

  constructor(message: string) {
    super(message);
    this.name = "PolicyDeniedError";
  }
}
