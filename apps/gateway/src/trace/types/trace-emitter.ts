import type { CallTrace } from "@keidai/shared";

export interface TraceEmitter {
  emit(trace: CallTrace): void;
  subscribe(listener: (trace: CallTrace) => void): () => void;
}

export const TRACE_EMITTER = Symbol("TRACE_EMITTER");
