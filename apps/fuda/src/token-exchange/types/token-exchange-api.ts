import { z } from "zod";
import { TOKEN_EXCHANGE_TTL_SECONDS } from "../constants.js";

/**
 * Token exchange request. Modeled on RFC 8693 (subject_token) plus the
 * requested acting agent. Not a full OAuth2 authorization-server surface —
 * no grant_type ceremony, consent, refresh, or PKCE.
 */
export const tokenExchangeBodySchema = z.object({
  subject_token: z.string().min(1),
  agent_id: z.string().min(1),
});

export type TokenExchangeBody = z.infer<typeof tokenExchangeBodySchema>;

/** RFC 8693-shaped successful token response. */
export interface TokenExchangeResponse {
  access_token: string;
  token_type: "Bearer";
  expires_in: typeof TOKEN_EXCHANGE_TTL_SECONDS;
}
