import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { inject, injectable } from "tsyringe";
import { OAuthConnectionReadService } from "./oauth-connection-read.service.js";
import { OAuthLinkService } from "./oauth-link.service.js";
import {
  oauthCallbackErrorHtml,
  oauthCallbackSuccessHtml,
} from "./utils/oauth-callback-html.js";

function readOwnerQuery(
  request: FastifyRequest<{ Querystring: { owner?: string } }>,
): string | undefined {
  const owner = request.query.owner?.trim();
  return owner || undefined;
}

function readBaseUrl(request: FastifyRequest): string {
  const forwardedProto = request.headers["x-forwarded-proto"];
  const protocol =
    (typeof forwardedProto === "string"
      ? forwardedProto.split(",")[0]?.trim()
      : undefined) ?? "http";
  const host = request.headers.host ?? "127.0.0.1";
  return `${protocol}://${host}`;
}

@injectable()
export class OAuthApiController {
  constructor(
    @inject(OAuthLinkService)
    private readonly oauthLink: OAuthLinkService,
    @inject(OAuthConnectionReadService)
    private readonly oauthConnections: OAuthConnectionReadService,
  ) {}

  registerRoutes(app: FastifyInstance): void {
    app.post<{ Params: { provider: string }; Querystring: { owner?: string } }>(
      "/api/oauth/initiate/:provider",
      async (request, reply) => {
        try {
          const result = await this.oauthLink.initiate(
            request.params.provider,
            readBaseUrl(request),
            readOwnerQuery(request),
          );
          reply.send(result);
        } catch (error) {
          reply
            .code(400)
            .send({ error: error instanceof Error ? error.message : String(error) });
        }
      },
    );

    app.get<{ Querystring: { owner?: string } }>(
      "/api/oauth/connections",
      async (request, reply) => {
        try {
          reply.send(
            await this.oauthConnections.listConnections(readOwnerQuery(request)),
          );
        } catch (error) {
          reply
            .code(400)
            .send({ error: error instanceof Error ? error.message : String(error) });
        }
      },
    );

    app.delete<{ Params: { provider: string }; Querystring: { owner?: string } }>(
      "/api/oauth/connections/:provider",
      async (request, reply) => {
        try {
          const removed = await this.oauthLink.unlink(
            request.params.provider,
            readOwnerQuery(request),
          );
          if (!removed) {
            reply.code(404).send({ error: "No OAuth grant found for provider" });
            return;
          }
          reply.code(204).send();
        } catch (error) {
          reply
            .code(400)
            .send({ error: error instanceof Error ? error.message : String(error) });
        }
      },
    );

    app.get<{
      Params: { provider: string };
      Querystring: {
        code?: string;
        state?: string;
        error?: string;
        error_description?: string;
      };
    }>("/oauth/callback/:provider", async (request, reply) => {
      await this.handleCallback(request, reply);
    });
  }

  private async handleCallback(
    request: FastifyRequest<{
      Params: { provider: string };
      Querystring: {
        code?: string;
        state?: string;
        error?: string;
        error_description?: string;
      };
    }>,
    reply: FastifyReply,
  ): Promise<void> {
    const result = await this.oauthLink.completeCallback(
      request.params.provider,
      request.query,
    );

    if (result.success) {
      reply
        .code(200)
        .type("text/html; charset=utf-8")
        .send(oauthCallbackSuccessHtml());
      return;
    }

    reply
      .code(400)
      .type("text/html; charset=utf-8")
      .send(oauthCallbackErrorHtml(result.error ?? "Authorization failed"));
  }
}
