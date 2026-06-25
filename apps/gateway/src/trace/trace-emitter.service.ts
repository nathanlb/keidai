import type { CallTrace } from "@keidai/shared";
import { injectable } from "tsyringe";
import type { TraceEmitter } from "./types/trace-emitter.js";
import { emitOtelSpan } from "./utils/otel-trace-sink.js";

@injectable()
export class TraceEmitterService implements TraceEmitter {
  emit(trace: CallTrace): void {
    process.stdout.write(
      `${JSON.stringify({ ...trace, recordType: "call_trace" })}\n`,
    );
    emitOtelSpan(trace);
  }
}
