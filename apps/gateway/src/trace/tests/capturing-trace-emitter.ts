import type { CallTrace } from "@torii/shared";
import type { TraceEmitter } from "../types/trace-emitter.js";

export class CapturingTraceEmitter implements TraceEmitter {
  readonly traces: CallTrace[] = [];

  emit(trace: CallTrace): void {
    this.traces.push(trace);
  }
}
