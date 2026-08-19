import type { CallTrace } from "@keidai/shared";
import type { TraceEmitter } from "../types/trace-emitter.js";

export class CapturingTraceEmitter implements TraceEmitter {
  readonly traces: CallTrace[] = [];

  async emit(trace: CallTrace): Promise<void> {
    this.traces.push(trace);
  }

  subscribe(): () => void {
    return () => {};
  }
}
