import { CONNECTION_SSE_EVENT, type ConnectionSseEvent } from "@keidai/shared";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { inject, injectable } from "tsyringe";
import { ToolCatalogService } from "../catalog/tool-catalog.service.js";
import { runWithAgentPrincipal } from "../identity/agent-principal-context.js";
import { operatorReconnectPrincipal } from "../identity/operator-reconnect-principal.js";
import { ConnectionManager } from "./connection-manager.service.js";
import { ConnectionReadService } from "./connection-read.service.js";
import { openSseStream } from "../http/utils/sse-stream.js";

function readOwnerQuery(
  request: FastifyRequest<{ Querystring: { owner?: string } }>,
): string | undefined {
  const owner = request.query.owner?.trim();
  return owner || undefined;
}

@injectable()
export class ConnectionsApiController {
  constructor(
    @inject(ConnectionReadService)
    private readonly connectionRead: ConnectionReadService,
    @inject(ConnectionManager)
    private readonly connectionManager: ConnectionManager,
    @inject(ToolCatalogService)
    private readonly toolCatalog: ToolCatalogService,
  ) {}

  registerRoutes(app: FastifyInstance): void {
    app.get<{ Querystring: { owner?: string } }>(
      "/api/connections",
      async (request, reply) => {
        reply.send(this.connectionRead.listConnections(readOwnerQuery(request)));
      },
    );

    app.get("/api/connections/:name/tools", async (request, reply) => {
      const { name } = request.params as { name: string };
      reply.send(this.connectionRead.getServerTools(name));
    });

    app.post<{ Querystring: { owner?: string } }>(
      "/api/connections/reconnect",
      async (request, reply) => {
        const ownerId = readOwnerQuery(request);
        await this.runReconnect(ownerId, async () => {
          await this.connectionManager.reconnectAll(ownerId);
          await this.refreshCatalogAndBroadcast(undefined, ownerId);
        });
        reply.send({ ok: true });
      },
    );

    app.post<{
      Params: { name: string };
      Querystring: { owner?: string };
    }>("/api/connections/:name/reconnect", async (request, reply) => {
      const { name } = request.params;
      const ownerId = readOwnerQuery(request);
      await this.runReconnect(ownerId, async () => {
        await this.connectionManager.reconnect(name, ownerId);
        await this.refreshCatalogAndBroadcast(name, ownerId);
      });
      reply.send({ ok: true });
    });

    app.get<{ Querystring: { owner?: string } }>(
      "/api/connections/events",
      (request, reply) => {
        const ownerId = readOwnerQuery(request);
        const { writeEvent } = openSseStream(request, reply);

        const emit = (event: ConnectionSseEvent): void => {
          writeEvent(event.type, event.connection);
        };

        for (const connection of this.connectionRead.listConnections(ownerId)
          .connections) {
          emit({
            type: CONNECTION_SSE_EVENT.stateChanged,
            connection,
          });
        }

        const unsubscribe = this.connectionRead.subscribe(emit, ownerId);

        request.raw.on("close", () => {
          unsubscribe();
        });
      },
    );
  }

  /**
   * user_oauth handshakes need an owner to resolve Authorization. Operator
   * reconnect passes `?owner=`; wrap credential resolution in that context.
   */
  private async runReconnect(
    ownerId: string | undefined,
    fn: () => Promise<void>,
  ): Promise<void> {
    if (!ownerId) {
      await fn();
      return;
    }

    await runWithAgentPrincipal(operatorReconnectPrincipal(ownerId), fn);
  }

  private async refreshCatalogAndBroadcast(
    name?: string,
    ownerId?: string,
  ): Promise<void> {
    await this.toolCatalog.refresh();
    this.connectionManager.rebroadcast(name, ownerId);
  }
}
