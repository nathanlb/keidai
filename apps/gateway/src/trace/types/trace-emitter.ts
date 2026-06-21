import type { CallTrace } from "@keidai/shared";

export interface TraceEmitter {
  emit(trace: CallTrace): void;
}

export const TRACE_EMITTER = Symbol("TRACE_EMITTER");
