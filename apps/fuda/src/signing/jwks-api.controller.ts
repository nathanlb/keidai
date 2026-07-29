import type { FastifyInstance } from "fastify";
import { inject, injectable } from "tsyringe";
import { SigningKeyService } from "./signing-key.service.js";

/**
 * Public JWKS discovery for Torii offline JWT validation.
 * Unauthenticated by design
 */
@injectable()
export class JwksApiController {
  constructor(
    @inject(SigningKeyService)
    private readonly signingKeys: SigningKeyService,
  ) {}

  registerRoutes(app: FastifyInstance): void {
    app.get("/.well-known/jwks.json", async (_request, reply) => {
      reply
        .header("cache-control", "public, max-age=60")
        .send(this.signingKeys.getJwks());
    });
  }
}
