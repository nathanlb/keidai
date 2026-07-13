import type { CallTrace, TraceListItem } from "@keidai/shared";
import { deriveTraceOutcome } from "./derive-trace-outcome.js";

export function projectTraceItem(trace: CallTrace): TraceListItem {
  return {
    ...trace,
    outcome: deriveTraceOutcome(trace),
  };
}
