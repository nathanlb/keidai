import type { ToriiCallMeta } from "@keidai/shared";

export class PolicyDeniedError extends Error {
  readonly code = "policy_denied" as const;

  constructor(
    readonly toolName: string,
    readonly meta?: ToriiCallMeta,
  ) {
    super(`policy_denied: ${toolName}`);
    this.name = "PolicyDeniedError";
  }
}
