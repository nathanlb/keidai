import "reflect-metadata";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PolicyDecision } from "@keidai/shared";
import { ConnectionManager } from "../../connections/connection-manager.service.js";
import { DefaultMcpClientConnector } from "../../connections/mcp-client-connector.service.js";
import { startMockMcpServer } from "../../connections/tests/mock-mcp-server.js";
import { ToriiConfigService } from "../../config/torii-config.service.js";
import { ToolCatalogService } from "../../catalog/tool-catalog.service.js";
import { ToolDispatchService } from "../../dispatch/tool-dispatch.service.js";
import {
  bootBackends,
  createCredentialServices,
  withStubAgentPrincipal,
} from "../../credentials/tests/test-helpers.js";
import { createPolicyEnforcement, createApprovalServices } from "../../policy/tests/test-helpers.js";
import { CapturingTraceEmitter } from "../../trace/tests/capturing-trace-emitter.js";
import { createCapturingLogger } from "../tests/test-helpers.js";
import { StructuredLoggerService } from "../structured-logger.service.js";
import { TraceEmitterService } from "../../trace/trace-emitter.service.js";
import { InMemoryTraceRepository } from "../../trace/in-memory-trace-repository.service.js";
import {
  finalizeCallTrace,
  toTracePrincipal,
} from "../../trace/utils/build-call-trace.js";
import { STUB_AGENT_PRINCIPAL } from "../../identity/stub-agent-principal.js";

describe("gateway log streams", () => {
  it("keeps CallTrace on stdout and operational logs on stderr", async () => {
    const mockServer = await startMockMcpServer({
      tools: [{ name: "ping", description: "Ping" }],
    });
    const configService = new ToriiConfigService({
      oauth_providers: {},
      servers: [
        {
          name: "demo",
          transport: { type: "http", url: mockServer.url },
          credential: { strategy: "none" },
          policy: { default: "deny", allow: ["ping"] },
        },
      ],
      agents: [],
    });
    const { credentialResolver } = createCredentialServices();
    const logger = createCapturingLogger();
    const connectionManager = new ConnectionManager(
      configService,
      new DefaultMcpClientConnector(credentialResolver),
      logger,
    );
    const toolCatalog = new ToolCatalogService(
      connectionManager,
      credentialResolver,
      createPolicyEnforcement(configService),
      logger,
    );
    const traceEmitter = new CapturingTraceEmitter();
    const toolDispatch = new ToolDispatchService(
      toolCatalog,
      connectionManager,
      credentialResolver,
      traceEmitter,
      createPolicyEnforcement(configService),
      createApprovalServices(configService).approvalGate,
    );

    const stdoutLines: string[] = [];
    const stderrLines: string[] = [];
    const originalStdoutWrite = process.stdout.write.bind(process.stdout);
    const originalStderrWrite = process.stderr.write.bind(process.stderr);
    process.stdout.write = ((chunk: string | Uint8Array) => {
      stdoutLines.push(String(chunk));
      return true;
    }) as typeof process.stdout.write;
    process.stderr.write = ((chunk: string | Uint8Array) => {
      stderrLines.push(String(chunk));
      return true;
    }) as typeof process.stderr.write;

    try {
      const structuredLogger = new StructuredLoggerService();
      structuredLogger.info("boot.config_loaded", { serverCount: 1 });

      await withStubAgentPrincipal(async () => {
        await bootBackends(connectionManager, toolCatalog);
        await toolDispatch.callTool("demo.ping");
      });

      const traceEmitterService = new TraceEmitterService(
        new InMemoryTraceRepository(),
      );
      traceEmitterService.emit(
        finalizeCallTrace(
          {
            server: "demo",
            tool: "ping",
            principal: toTracePrincipal(STUB_AGENT_PRINCIPAL),
            credentialRef: "none",
            policyDecision: PolicyDecision.Allowed,
            durationMs: 1,
          },
          { traceId: "trace-boot-check", timestamp: "2026-06-25T12:00:00.000Z" },
        ),
      );

      assert.ok(stdoutLines.length >= 1);
      assert.ok(stderrLines.length >= 1);

      const callTraceLine = stdoutLines
        .map((line) => line.trim())
        .find((line) => line.startsWith("{"));
      assert.ok(callTraceLine);
      const callTrace = JSON.parse(callTraceLine!) as Record<string, unknown>;
      assert.equal(callTrace.recordType, "call_trace");
      assert.equal(callTrace.traceId, "trace-boot-check");

      const bootLogLine = stderrLines
        .map((line) => line.trim())
        .find((line) => line.includes('"event":"boot.config_loaded"'));
      assert.ok(bootLogLine);
      const bootLog = JSON.parse(bootLogLine!) as Record<string, unknown>;
      assert.equal(bootLog.recordType, "log");
      assert.equal(bootLog.event, "boot.config_loaded");

      assert.equal(traceEmitter.traces.length, 1);
    } finally {
      process.stdout.write = originalStdoutWrite;
      process.stderr.write = originalStderrWrite;
      await mockServer.close();
    }
  });
});
