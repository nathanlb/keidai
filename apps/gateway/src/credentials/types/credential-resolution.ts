export interface ResolvedCredentials {
  headers: Record<string, string>;
  /** Trace-safe credential reference — never contains secret material. */
  credentialRef?: string;
}

export class CredentialResolutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CredentialResolutionError";
  }
}
