import { PolicyDecision, type CallTrace, type TraceOutcome } from "@keidai/shared";

const LINKING_REQUIRED_PREFIX = "OAuth connection required";

export function deriveTraceOutcome(trace: CallTrace): TraceOutcome {
  if (trace.policyDecision === PolicyDecision.Denied) {
    return "denied";
  }
  if (trace.error?.startsWith(LINKING_REQUIRED_PREFIX)) {
    return "linking_required";
  }
  if (trace.error) {
    return "error";
  }
  return "success";
}
