import type { CallTrace } from "@torii/shared";

export interface TraceEmitter {
  emit(trace: CallTrace): void;
}

export const TRACE_EMITTER = Symbol("TRACE_EMITTER");
