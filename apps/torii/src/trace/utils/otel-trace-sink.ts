import type { CallTrace } from "@keidai/shared";
import {
  trace,
  type Span,
  type Tracer,
} from "@opentelemetry/api";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import {
  BatchSpanProcessor,
  type SpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";

let otelTracer: Tracer | null | undefined;

function getOtelTracer(): Tracer | null {
  if (otelTracer !== undefined) {
    return otelTracer;
  }

  if (!process.env.OTEL_EXPORTER_OTLP_ENDPOINT) {
    otelTracer = null;
    return otelTracer;
  }

  try {
    const exporter = new OTLPTraceExporter();
    const processor: SpanProcessor = new BatchSpanProcessor(exporter);
    const provider = new NodeTracerProvider({
      resource: resourceFromAttributes({
        [ATTR_SERVICE_NAME]: "torii-gateway",
      }),
      spanProcessors: [processor],
    });
    provider.register();
    otelTracer = trace.getTracer("torii-gateway");
  } catch {
    otelTracer = null;
  }

  return otelTracer;
}

export function emitOtelSpan(callTrace: CallTrace): void {
  const tracer = getOtelTracer();
  if (!tracer) {
    return;
  }

  const startTimeMs = Date.parse(callTrace.timestamp);
  const span: Span = tracer.startSpan("tools/call", {
    startTime: Number.isNaN(startTimeMs) ? undefined : startTimeMs,
  });

  span.setAttributes({
    "torii.trace_id": callTrace.traceId,
    "torii.server": callTrace.server,
    "torii.tool": callTrace.tool,
    "torii.policy_decision": callTrace.policyDecision,
    ...(callTrace.principal
      ? {
          "torii.agent_id": callTrace.principal.agentId,
          "torii.owner_id": callTrace.principal.ownerId,
        }
      : {}),
    ...(callTrace.credentialRef
      ? { "torii.credential_ref": callTrace.credentialRef }
      : {}),
    ...(callTrace.durationMs !== undefined
      ? { "torii.duration_ms": callTrace.durationMs }
      : {}),
    ...(callTrace.error ? { "torii.error": callTrace.error } : {}),
  });

  if (callTrace.error) {
    span.recordException(new Error(callTrace.error));
  }

  span.end(
    callTrace.durationMs !== undefined
      ? startTimeMs + callTrace.durationMs
      : undefined,
  );
}

/** Test-only reset for OTel lazy initialization. */
export function resetOtelTracerForTests(): void {
  otelTracer = undefined;
}
