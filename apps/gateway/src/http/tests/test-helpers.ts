import type {
  AgentIdentityResolver,
  AgentPrincipal,
} from "@keidai/shared";
import type { ToolCatalogService } from "../../catalog/tool-catalog.service.js";
import { ConfigReadService } from "../../config/config-read.service.js";
import { ToriiConfigService } from "../../config/torii-config.service.js";
import type { ToolDispatchService } from "../../dispatch/tool-dispatch.service.js";
import { GatewayHttpServer } from "../gateway-http-server.service.js";
import { GatewayMcpServer } from "../../mcp/gateway-mcp-server.service.js";
import { CapturingTraceEmitter } from "../../trace/tests/capturing-trace-emitter.js";
import type { TraceEmitter } from "../../trace/types/trace-emitter.js";
import {
  createInboundIdentityService,
  FixedIdentityResolver,
} from "../../identity/tests/test-helpers.js";

export function createTestGatewayHttpServer(
  toolCatalog: ToolCatalogService,
  toolDispatch: ToolDispatchService,
  options: {
    identityResolver?: AgentIdentityResolver;
    traceEmitter?: TraceEmitter;
    configService?: ToriiConfigService;
  } = {},
): GatewayHttpServer {
  const configRead = new ConfigReadService(
    options.configService ??
      new ToriiConfigService({ oauth_providers: {}, servers: [], agents: [] }),
  );
  const mcpServer = new GatewayMcpServer(
    toolCatalog,
    toolDispatch,
    createInboundIdentityService(options.identityResolver),
    options.traceEmitter ?? new CapturingTraceEmitter(),
  );

  return new GatewayHttpServer(configRead, mcpServer);
}

export { FixedIdentityResolver };
export type { AgentIdentityResolver, AgentPrincipal };
