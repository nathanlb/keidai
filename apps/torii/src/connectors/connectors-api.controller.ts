import type { FastifyInstance } from "fastify";
import { inject, injectable } from "tsyringe";
import { CONNECTOR_CATALOG_VERSION } from "@keidai/shared";
import { ConnectorManagementService } from "./connector-management.service.js";
import {
  createConnectorBodySchema,
  installCatalogBodySchema,
  updateConnectorBodySchema,
} from "./types/connector-api.js";
import { ConnectorWriteError } from "./types/connector-write.js";

@injectable()
export class ConnectorsApiController {
  constructor(
    @inject(ConnectorManagementService)
    private readonly connectors: ConnectorManagementService,
  ) {}

  registerRoutes(app: FastifyInstance): void {
    app.get("/api/catalog/connectors", async (_request, reply) => {
      reply.send({
        catalog: this.connectors.listCatalog(),
        version: CONNECTOR_CATALOG_VERSION,
      });
    });

    app.get("/api/connectors", async (_request, reply) => {
      reply.send({ connectors: await this.connectors.list() });
    });

    app.get("/api/connectors/:slug", async (request, reply) => {
      const { slug } = request.params as { slug: string };
      const connector = await this.connectors.get(slug);
      if (!connector) {
        reply.code(404).send({ error: "connector not found" });
        return;
      }
      reply.send({ connector });
    });

    app.post("/api/connectors/from-catalog", async (request, reply) => {
      const parsed = installCatalogBodySchema.safeParse(request.body);
      if (!parsed.success) {
        reply.code(400).send({
          error: "invalid catalog install",
          details: parsed.error.flatten(),
        });
        return;
      }
      try {
        const connector = await this.connectors.installFromCatalog(parsed.data);
        reply.code(201).send({ connector });
      } catch (error) {
        this.sendWriteError(reply, error);
      }
    });

    app.post("/api/connectors", async (request, reply) => {
      const parsed = createConnectorBodySchema.safeParse(request.body);
      if (!parsed.success) {
        reply.code(400).send({
          error: "invalid connector",
          details: parsed.error.flatten(),
        });
        return;
      }
      try {
        const connector = await this.connectors.create(parsed.data);
        reply.code(201).send({ connector });
      } catch (error) {
        this.sendWriteError(reply, error);
      }
    });

    app.patch("/api/connectors/:slug", async (request, reply) => {
      const { slug } = request.params as { slug: string };
      const parsed = updateConnectorBodySchema.safeParse(request.body);
      if (!parsed.success) {
        reply.code(400).send({
          error: "invalid connector update",
          details: parsed.error.flatten(),
        });
        return;
      }
      try {
        const connector = await this.connectors.update(slug, parsed.data);
        if (!connector) {
          reply.code(404).send({ error: "connector not found" });
          return;
        }
        reply.send({ connector });
      } catch (error) {
        this.sendWriteError(reply, error);
      }
    });

    app.delete("/api/connectors/:slug", async (request, reply) => {
      const { slug } = request.params as { slug: string };
      try {
        if (!(await this.connectors.delete(slug))) {
          reply.code(404).send({ error: "connector not found" });
          return;
        }
        reply.code(204).send();
      } catch (error) {
        this.sendWriteError(reply, error);
      }
    });
  }

  private sendWriteError(
    reply: { code: (statusCode: number) => { send: (payload: unknown) => void } },
    error: unknown,
  ): void {
    if (error instanceof ConnectorWriteError) {
      reply.code(error.statusCode).send({ error: error.message });
      return;
    }
    throw error;
  }
}
