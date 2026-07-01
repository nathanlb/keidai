import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { inject, injectable } from "tsyringe";
import { ToriiConfigService } from "../config/torii-config.service.js";
import { resolveGatewayBaseUrl } from "../config/utils/resolve-gateway-base-url.js";
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

function readUiOrigin(request: FastifyRequest): string | undefined {
  const header = request.headers["x-torii-ui-origin"];
  if (typeof header !== "string") {
    return undefined;
  }

  const trimmed = header.trim();
  return trimmed || undefined;
}

@injectable()
export class OAuthApiController {
  constructor(
    @inject(ToriiConfigService)
    private readonly configService: ToriiConfigService,
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
            resolveGatewayBaseUrl(this.configService.get(), request),
            readOwnerQuery(request),
            readUiOrigin(request),
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
        .send(
          oauthCallbackSuccessHtml(
            result.page ?? { provider: request.params.provider, status: "success" },
          ),
        );
      return;
    }

    reply
      .code(400)
      .type("text/html; charset=utf-8")
      .send(
        oauthCallbackErrorHtml(
          result.error ?? "Authorization failed",
          result.page ?? {
            provider: request.params.provider,
            status: "error",
            error: result.error ?? "Authorization failed",
          },
        ),
      );
  }
}
