import type { PolicyDecision } from "./policy-decision.js";

/** Internal agent identity on a call trace — never the credential's native subject. */
export interface CallTracePrincipal {
  agentId: string;
  ownerId: string;
}

/** Structured audit record emitted on every gateway `tools/call`. */
export interface CallTrace {
  traceId: string;
  timestamp: string;
  server: string;
  /** Bare backend tool name — no namespace prefix. */
  tool: string;
  /** Omitted when inbound identity was not resolved before the call. */
  principal?: CallTracePrincipal;
  /** Trace-safe credential reference — never secret material. */
  credentialRef?: string;
  policyDecision: PolicyDecision;
  /** Omitted when the backend was never reached (e.g. policy denied). */
  durationMs?: number;
  error?: string;
}
