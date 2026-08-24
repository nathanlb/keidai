import { describe, expect, it } from "vitest";
import { buildTraceSpans } from "../build-trace-spans.js";
import {
  backendErrorTrace,
  deniedTrace,
  githubServer,
  linkingRequiredTrace,
  stripeServer,
  successTrace,
} from "./trace-detail-fixtures.js";

describe("buildTraceSpans", () => {
  it("stops at policy for denied traces", () => {
    const { spans, totalMs } = buildTraceSpans(deniedTrace, githubServer);

    expect(spans.map((span) => span.label)).toEqual([
      "gateway.receive",
      "principal.resolve",
      "policy.evaluate",
      "gateway.respond",
    ]);
    expect(totalMs).toBe(7);
    expect(spans[2]?.barClass).toContain("destructive");
  });

  it("includes backend timing for successful oauth traces", () => {
    const { spans, totalMs } = buildTraceSpans(successTrace, githubServer);

    expect(spans.map((span) => span.label)).toEqual([
      "gateway.receive",
      "principal.resolve",
      "policy.evaluate",
      "credential.resolve",
      "backend.call",
      "gateway.respond",
    ]);
    expect(totalMs).toBe(145);
    expect(spans.find((span) => span.label === "backend.call")?.durLabel).toBe(
      "118ms",
    );
    expect(spans.find((span) => span.label === "backend.call")?.barClass).toBe(
      "bg-success",
    );
  });

  it("marks credential resolution as failed for linking_required", () => {
    const { spans } = buildTraceSpans(linkingRequiredTrace, githubServer);
    const credential = spans.find(
      (span) => span.label === "credential.resolve",
    );

    expect(credential?.barClass).toBe("bg-warning");
    expect(spans.some((span) => span.label === "backend.call")).toBe(false);
  });

  it("uses a short service_key credential span", () => {
    const trace = { ...successTrace, server: "stripe", durationMs: 142 };
    const { spans } = buildTraceSpans(trace, stripeServer);
    const credential = spans.find(
      (span) => span.label === "credential.resolve",
    );

    expect(credential?.durLabel).toBe("3ms");
  });

  it("marks backend spans as errors for backend_error outcomes", () => {
    const { spans } = buildTraceSpans(backendErrorTrace, githubServer);
    const backend = spans.find((span) => span.label === "backend.call");

    expect(backend?.barClass).toBe("bg-destructive");
    expect(backend?.durLabel).toBe("1840ms");
  });
});
