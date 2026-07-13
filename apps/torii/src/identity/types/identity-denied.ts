export class IdentityDeniedError extends Error {
  readonly code = "identity_denied" as const;

  constructor(message: string) {
    super(`identity_denied: ${message}`);
    this.name = "IdentityDeniedError";
  }
}
