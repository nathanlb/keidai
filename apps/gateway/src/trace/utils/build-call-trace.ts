import { randomUUID } from "node:crypto";
import type { AgentPrincipal, CallTrace, CallTracePrincipal } from "@torii/shared";

export function createTraceId(): string {
  return randomUUID();
}

export function createTraceTimestamp(): string {
  return new Date().toISOString();
}

export function toTracePrincipal(
  principal: AgentPrincipal | undefined,
): CallTracePrincipal | undefined {
  if (!principal) {
    return undefined;
  }

  return {
    agentId: principal.agentId,
    ownerId: principal.ownerId,
  };
}

export function finalizeCallTrace(
  base: Omit<CallTrace, "traceId" | "timestamp">,
  context: { traceId: string; timestamp: string },
): CallTrace {
  const trace: CallTrace = {
    traceId: context.traceId,
    timestamp: context.timestamp,
    ...base,
  };

  if (trace.policyDecision === "denied") {
    delete trace.durationMs;
  }

  return trace;
}
