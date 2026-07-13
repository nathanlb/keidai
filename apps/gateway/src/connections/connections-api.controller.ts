import { CONNECTION_SSE_EVENT, type ConnectionSseEvent } from "@keidai/shared";
import type { FastifyInstance } from "fastify";
import { inject, injectable } from "tsyringe";
import { ConnectionManager } from "./connection-manager.service.js";
import { ConnectionReadService } from "./connection-read.service.js";

@injectable()
export class ConnectionsApiController {
  constructor(
    @inject(ConnectionReadService)
    private readonly connectionRead: ConnectionReadService,
    @inject(ConnectionManager)
    private readonly connectionManager: ConnectionManager,
  ) {}

  registerRoutes(app: FastifyInstance): void {
    app.get("/api/connections", async (_request, reply) => {
      reply.send(this.connectionRead.listConnections());
    });

    app.get("/api/connections/:name/tools", async (request, reply) => {
      const { name } = request.params as { name: string };
      reply.send(this.connectionRead.getServerTools(name));
    });

    app.post("/api/connections/reconnect", async (_request, reply) => {
      await this.connectionManager.reconnectAll();
      reply.send({ ok: true });
    });

    app.post("/api/connections/:name/reconnect", async (request, reply) => {
      const { name } = request.params as { name: string };
      await this.connectionManager.reconnect(name);
      reply.send({ ok: true });
    });

    app.get("/api/connections/events", (request, reply) => {
      reply.hijack();
      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });

      const writeEvent = (event: ConnectionSseEvent): void => {
        reply.raw.write(`event: ${event.type}\n`);
        reply.raw.write(`data: ${JSON.stringify(event.connection)}\n\n`);
      };

      for (const connection of this.connectionRead.listConnections().connections) {
        writeEvent({
          type: CONNECTION_SSE_EVENT.stateChanged,
          connection,
        });
      }

      const unsubscribe = this.connectionRead.subscribe(writeEvent);

      request.raw.on("close", () => {
        unsubscribe();
      });
    });
  }
}
