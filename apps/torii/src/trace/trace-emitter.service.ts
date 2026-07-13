import type { CallTrace } from "@keidai/shared";
import { inject, injectable } from "tsyringe";
import type { TraceEmitter } from "./types/trace-emitter.js";
import { TRACE_REPOSITORY } from "./types/trace-repository.js";
import type { TraceRepository } from "./types/trace-repository.js";
import { emitOtelSpan } from "./utils/otel-trace-sink.js";

@injectable()
export class TraceEmitterService implements TraceEmitter {
  private readonly listeners = new Set<(trace: CallTrace) => void>();

  constructor(
    @inject(TRACE_REPOSITORY)
    private readonly repository: TraceRepository,
  ) {}

  emit(trace: CallTrace): void {
    process.stdout.write(
      `${JSON.stringify({ ...trace, recordType: "call_trace" })}\n`,
    );
    emitOtelSpan(trace);
    this.repository.append(trace);
    for (const listener of this.listeners) {
      listener(trace);
    }
  }

  subscribe(listener: (trace: CallTrace) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}
