import type { FastifyInstance } from "fastify";
import { inject, injectable } from "tsyringe";
import {
  AGENT_REPOSITORY,
  type AgentRepository,
} from "../agents/types/agent-repository.js";
import {
  BEARER_REPOSITORY,
  type BearerRepository,
} from "../bearers/types/bearer-repository.js";
import { FudaConfigService } from "../config/fuda-config.service.js";
import { SigningKeyService } from "../signing/signing-key.service.js";
import { SubjectTokenValidationError } from "../subject-token/types/subject-token-validation-error.js";
import {
  SUBJECT_TOKEN_VALIDATOR,
  type SubjectTokenValidator,
} from "../subject-token/types/subject-token-validator.js";
import {
  TOKEN_EXCHANGE_AUDIENCE,
  TOKEN_EXCHANGE_TTL_SECONDS,
} from "./constants.js";
import {
  tokenExchangeBodySchema,
  type TokenExchangeResponse,
} from "./types/token-exchange-api.js";

/**
 * Agent-facing token exchange (NAT-119). Validates a platform subject token,
 * checks bearer→agent grants, and mints a short-lived agent identity JWT.
 */
@injectable()
export class TokenExchangeApiController {
  constructor(
    @inject(FudaConfigService)
    private readonly configService: FudaConfigService,
    @inject(SigningKeyService)
    private readonly signingKeys: SigningKeyService,
    @inject(AGENT_REPOSITORY)
    private readonly agents: AgentRepository,
    @inject(BEARER_REPOSITORY)
    private readonly bearers: BearerRepository,
    @inject(SUBJECT_TOKEN_VALIDATOR, { isOptional: true })
    private readonly subjects: SubjectTokenValidator | undefined,
  ) {}

  registerRoutes(app: FastifyInstance): void {
    app.post("/token", async (request, reply) => {
      const parsed = tokenExchangeBodySchema.safeParse(request.body);
      if (!parsed.success) {
        reply.code(400).send({
          error: "invalid token exchange request",
          details: parsed.error.flatten(),
        });
        return;
      }

      if (!this.subjects) {
        reply.code(500).send({ error: "subject token validator not configured" });
        return;
      }

      const { subject_token: subjectToken, agent_id: agentId } = parsed.data;

      let bearerId: string;
      try {
        bearerId = await this.subjects.validate(subjectToken);
      } catch (error) {
        if (error instanceof SubjectTokenValidationError) {
          reply.code(401).send({ error: "invalid subject token" });
          return;
        }
        throw error;
      }

      const agent = this.agents.get(agentId);
      if (!agent) {
        reply.code(404).send({ error: "agent not found" });
        return;
      }

      if (!this.bearers.hasGrant(bearerId, agentId)) {
        reply.code(403).send({ error: "bearer not granted for agent" });
        return;
      }

      const { tokenIssuer } = this.configService.get();
      const accessToken = await this.signingKeys.signJwt({
        issuer: tokenIssuer,
        audience: TOKEN_EXCHANGE_AUDIENCE,
        expiresInSeconds: TOKEN_EXCHANGE_TTL_SECONDS,
        claims: {
          agent_id: agent.id,
          owner_id: agent.ownerId,
          groups: agent.groups,
          bearer_id: bearerId,
        },
      });

      const body: TokenExchangeResponse = {
        access_token: accessToken,
        token_type: "Bearer",
        expires_in: TOKEN_EXCHANGE_TTL_SECONDS,
      };
      reply.send(body);
    });
  }
}
