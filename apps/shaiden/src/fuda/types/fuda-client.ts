/** Successful token exchange response (RFC 8693-shaped). */
export interface ExchangedAgentToken {
  accessToken: string;
  tokenType: "Bearer";
  expiresIn: number;
}

export interface ExchangeTokenInput {
  subjectToken: string;
  agentId: string;
}

export type TokenExchangeFailureKind =
  | "invalid_subject"
  | "grant_denied"
  | "agent_not_found"
  | "invalid_request"
  | "unreachable"
  | "unexpected";

/**
 * Typed failure from `POST /token`. Callers distinguish grant revocation and
 * policy-shaped denials from transport unavailability.
 */
export class TokenExchangeError extends Error {
  readonly kind: TokenExchangeFailureKind;
  readonly status?: number;

  constructor(
    kind: TokenExchangeFailureKind,
    message: string,
    options?: { status?: number; cause?: unknown },
  ) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = "TokenExchangeError";
    this.kind = kind;
    this.status = options?.status;
  }
}

export interface FudaClient {
  exchangeToken(input: ExchangeTokenInput): Promise<ExchangedAgentToken>;
}
