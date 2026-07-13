import "reflect-metadata";
import assert from "node:assert/strict";
import http from "node:http";
import { describe, it } from "node:test";
import { PolicyDecision } from "@keidai/shared";
import type {
  TraceListItem,
  TraceStatsResponse,
  TracesResponse,
} from "@keidai/shared";
import { InMemoryTraceRepository } from "../../trace/in-memory-trace-repository.service.js";
import { TraceEmitterService } from "../../trace/trace-emitter.service.js";
import {
  finalizeCallTrace,
  toTracePrincipal,
} from "../../trace/utils/build-call-trace.js";
import { STUB_AGENT_PRINCIPAL } from "../../identity/stub-agent-principal.js";
import type { GatewayHttpServer } from "../gateway-http-server.service.js";
import { createStubToolCatalog, createTestGatewayHttpServer } from "./test-helpers.js";

function parseSseChunk(chunk: string): Array<{ event: string; data: string }> {
  return chunk
    .split("\n\n")
    .filter(Boolean)
    .map((block) => {
      const lines = block.split("\n");
      const eventLine = lines.find((line) => line.startsWith("event: "));
      const dataLine = lines.find((line) => line.startsWith("data: "));
      if (!eventLine || !dataLine) {
        return null;
      }
      return {
        event: eventLine.slice("event: ".length),
        data: dataLine.slice("data: ".length),
      };
    })
    .filter((event): event is { event: string; data: string } => event !== null);
}

async function readSseEventsUntil(
  url: string,
  predicate: (events: Array<{ event: string; trace: TraceListItem }>) => boolean,
  timeoutMs = 5_000,
): Promise<Array<{ event: string; trace: TraceListItem }>> {
  return new Promise((resolve, reject) => {
    const parsed: Array<{ event: string; trace: TraceListItem }> = [];
    let buffer = "";

    const req = http.get(url, (res) => {
      assert.equal(res.statusCode, 200);
      res.on("data", (chunk) => {
        buffer += chunk.toString();
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";

        for (const part of parts) {
          const event = parseSseChunk(`${part}\n\n`)[0];
          if (!event) {
            continue;
          }
          parsed.push({
            event: event.event,
            trace: JSON.parse(event.data) as TraceListItem,
          });
        }

        if (predicate(parsed)) {
          req.destroy();
          resolve(parsed);
        }
      });
    });

    req.on("error", (error) => {
      if ((error as NodeJS.ErrnoException).code === "ECONNRESET") {
        resolve(parsed);
        return;
      }
      reject(error);
    });

    setTimeout(() => {
      req.destroy();
      reject(new Error("timed out waiting for SSE events"));
    }, timeoutMs);
  });
}

function createTracesGateway(
  traceRepository = new InMemoryTraceRepository(),
  traceEmitter = new TraceEmitterService(traceRepository),
): GatewayHttpServer {
  return createTestGatewayHttpServer(createStubToolCatalog(), {} as never, {
    traceRepository,
    traceEmitter,
  });
}

describe("Gateway /api/traces endpoints", () => {
  it("returns recent traces newest-first with filters and pagination", async () => {
    const traceRepository = new InMemoryTraceRepository();
    const traceEmitter = new TraceEmitterService(traceRepository);
    const gatewayHttpServer = createTracesGateway(
      traceRepository,
      traceEmitter,
    );

    traceEmitter.emit(
      finalizeCallTrace(
        {
          server: "github",
          tool: "search_issues",
          principal: toTracePrincipal(STUB_AGENT_PRINCIPAL),
          credentialRef: "github:stub-user",
          policyDecision: PolicyDecision.Allowed,
          durationMs: 10,
        },
        { traceId: "trace-1", timestamp: "2026-06-20T12:00:00.000Z" },
      ),
    );
    traceEmitter.emit(
      finalizeCallTrace(
        {
          server: "stripe",
          tool: "list_customers",
          principal: toTracePrincipal(STUB_AGENT_PRINCIPAL),
          credentialRef: "service_key:stripe",
          policyDecision: PolicyDecision.Allowed,
          durationMs: 20,
        },
        { traceId: "trace-2", timestamp: "2026-06-20T12:00:01.000Z" },
      ),
    );

    const gateway = await gatewayHttpServer.start();
    try {
      const response = await fetch(`${gateway.baseUrl}/api/traces?limit=1`);
      assert.equal(response.status, 200);

      const body = (await response.json()) as TracesResponse;
      assert.equal(body.traces.length, 1);
      assert.equal(body.traces[0]?.traceId, "trace-2");
      assert.equal(body.traces[0]?.outcome, "success");
      assert.equal(body.nextCursor, "trace-2");

      const page2 = await fetch(
        `${gateway.baseUrl}/api/traces?limit=1&cursor=${body.nextCursor}`,
      );
      const body2 = (await page2.json()) as TracesResponse;
      assert.equal(body2.traces[0]?.traceId, "trace-1");

      const filtered = await fetch(
        `${gateway.baseUrl}/api/traces?server=stripe`,
      );
      const filteredBody = (await filtered.json()) as TracesResponse;
      assert.equal(filteredBody.traces.length, 1);
      assert.equal(filteredBody.traces[0]?.server, "stripe");
      assert.equal(JSON.stringify(body).includes("gho_"), false);
    } finally {
      await gateway.close();
    }
  });

  it("returns a single trace and summary stats", async () => {
    const traceRepository = new InMemoryTraceRepository();
    const traceEmitter = new TraceEmitterService(traceRepository);
    const gatewayHttpServer = createTracesGateway(
      traceRepository,
      traceEmitter,
    );

    traceEmitter.emit(
      finalizeCallTrace(
        {
          server: "github",
          tool: "search_issues",
          principal: toTracePrincipal(STUB_AGENT_PRINCIPAL),
          policyDecision: PolicyDecision.Denied,
          error: "policy denied",
        },
        { traceId: "detail-trace", timestamp: new Date().toISOString() },
      ),
    );

    const gateway = await gatewayHttpServer.start();
    try {
      const detail = await fetch(
        `${gateway.baseUrl}/api/traces/detail-trace`,
      );
      assert.equal(detail.status, 200);
      const trace = (await detail.json()) as TraceListItem;
      assert.equal(trace.outcome, "denied");

      const stats = await fetch(`${gateway.baseUrl}/api/traces/stats`);
      const statsBody = (await stats.json()) as TraceStatsResponse;
      assert.equal(statsBody.deniedCount, 1);
      assert.equal(statsBody.linkingRequiredCount, 0);
    } finally {
      await gateway.close();
    }
  });

  it("streams new traces over SSE", async () => {
    const traceRepository = new InMemoryTraceRepository();
    const traceEmitter = new TraceEmitterService(traceRepository);
    const gatewayHttpServer = createTracesGateway(
      traceRepository,
      traceEmitter,
    );

    const gateway = await gatewayHttpServer.start();
    try {
      const eventsPromise = readSseEventsUntil(
        `${gateway.baseUrl}/api/traces/events`,
        (events) =>
          events.some((entry) => entry.trace.traceId === "live-trace"),
      );

      traceEmitter.emit(
        finalizeCallTrace(
          {
            server: "deepwiki",
            tool: "read_wiki_structure",
            principal: toTracePrincipal(STUB_AGENT_PRINCIPAL),
            credentialRef: "none",
            policyDecision: PolicyDecision.Allowed,
            durationMs: 8,
          },
          { traceId: "live-trace", timestamp: new Date().toISOString() },
        ),
      );

      const events = await eventsPromise;
      assert.ok(
        events.some(
          (entry) =>
            entry.event === "trace_created" &&
            entry.trace.traceId === "live-trace",
        ),
      );
    } finally {
      await gateway.close();
    }
  });
});
