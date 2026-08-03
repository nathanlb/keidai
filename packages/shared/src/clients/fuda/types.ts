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

/** Shaiden-facing agent definition from `GET /agents/{id}` (no identity fields). */
export interface AgentDefinition {
  name: string;
  slug: string;
  persona: string;
  personaVersion: number;
}

export type TokenExchangeFailureKind =
  | "invalid_subject"
  | "grant_denied"
  | "agent_not_found"
  | "invalid_request"
  | "unreachable"
  | "unexpected";

export type AgentDefinitionFailureKind =
  | "agent_not_found"
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

/**
 * Typed failure from `GET /agents/{id}`. Unknown agent and Fuda unavailability
 * are task-start failures — never a silent default persona.
 */
export class AgentDefinitionError extends Error {
  readonly kind: AgentDefinitionFailureKind;
  readonly status?: number;

  constructor(
    kind: AgentDefinitionFailureKind,
    message: string,
    options?: { status?: number; cause?: unknown },
  ) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = "AgentDefinitionError";
    this.kind = kind;
    this.status = options?.status;
  }
}

export interface FudaClient {
  exchangeToken(input: ExchangeTokenInput): Promise<ExchangedAgentToken>;
  getAgentDefinition(agentId: string): Promise<AgentDefinition>;
}
