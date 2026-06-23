import type { FastifyInstance } from "fastify";
import { inject, injectable } from "tsyringe";
import { ConnectionReadService } from "./connection-read.service.js";
import type { ConnectionStateChangedEvent } from "./types/connections.dto.js";

@injectable()
export class ConnectionsApiController {
  constructor(
    @inject(ConnectionReadService)
    private readonly connectionRead: ConnectionReadService,
  ) {}

  registerRoutes(app: FastifyInstance): void {
    app.get("/api/connections", async (_request, reply) => {
      reply.send(this.connectionRead.listConnections());
    });

    app.get("/api/connections/events", (request, reply) => {
      reply.hijack();
      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });

      const writeEvent = (event: ConnectionStateChangedEvent): void => {
        reply.raw.write(`event: ${event.type}\n`);
        reply.raw.write(`data: ${JSON.stringify(event.connection)}\n\n`);
      };

      for (const connection of this.connectionRead.listConnections().connections) {
        writeEvent({ type: "connection_state_changed", connection });
      }

      const unsubscribe = this.connectionRead.subscribe(writeEvent);

      request.raw.on("close", () => {
        unsubscribe();
      });
    });
  }
}
