import { z } from "zod";
import {
  SANDBOX_TOKEN_AUDIENCE,
  TOKEN_EXCHANGE_AUDIENCE,
  TOKEN_EXCHANGE_AUDIENCES,
  TOKEN_EXCHANGE_TTL_SECONDS,
} from "../constants.js";

/**
 * Token exchange request. Modeled on RFC 8693 (subject_token) plus the
 * requested acting agent. Not a full OAuth2 authorization-server surface —
 * no grant_type ceremony, consent, refresh, or PKCE.
 *
 * `audience` defaults to `torii`, which requires `agent_id` and a bearer
 * grant. `shaiden-sandbox` exchanges the subject token alone: the sandbox
 * authorizes the runtime, not an agent.
 */
export const tokenExchangeBodySchema = z
  .object({
    subject_token: z.string().min(1),
    agent_id: z.string().min(1).optional(),
    audience: z.enum(TOKEN_EXCHANGE_AUDIENCES).optional(),
  })
  .superRefine((body, ctx) => {
    const audience = body.audience ?? TOKEN_EXCHANGE_AUDIENCE;
    if (audience === TOKEN_EXCHANGE_AUDIENCE && !body.agent_id) {
      ctx.addIssue({
        code: "custom",
        path: ["agent_id"],
        message: "agent_id is required for audience torii",
      });
    }
    if (audience === SANDBOX_TOKEN_AUDIENCE && body.agent_id) {
      ctx.addIssue({
        code: "custom",
        path: ["agent_id"],
        message: "agent_id is not accepted for audience shaiden-sandbox",
      });
    }
  });

export type TokenExchangeBody = z.infer<typeof tokenExchangeBodySchema>;

/** RFC 8693-shaped successful token response. */
export interface TokenExchangeResponse {
  access_token: string;
  token_type: "Bearer";
  expires_in: typeof TOKEN_EXCHANGE_TTL_SECONDS;
}
