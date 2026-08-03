import { z } from "zod";

/**
 * One-way seed input for Fuda (NAT-121). Extends the former Torii
 * agent-registration shape with `slug`, `name`, and `persona`.
 * Legacy fields (`subject`, `inbound_token`, `gated_tools`) may appear
 * in the YAML for copy-paste convenience but are stripped before load —
 * they are not stored in Fuda.
 */
export const seedAgentSchema = z
  .object({
    agent_id: z.string().min(1),
    slug: z.string().min(1),
    name: z.string().min(1),
    owner_id: z.string().min(1),
    groups: z.array(z.string().min(1)).default([]),
    persona: z.string().min(1),
  })
  .strict();

export const seedBearerSchema = z
  .object({
    bearer_id: z.string().min(1),
    display_name: z.string().min(1),
  })
  .strict();

export const seedGrantSchema = z
  .object({
    bearer_id: z.string().min(1),
    agent_id: z.string().min(1),
  })
  .strict();

export const seedFileSchema = z
  .object({
    agents: z.array(seedAgentSchema).default([]),
    bearers: z.array(seedBearerSchema).default([]),
    grants: z.array(seedGrantSchema).default([]),
  })
  .strict();

export type SeedAgent = z.infer<typeof seedAgentSchema>;
export type SeedBearer = z.infer<typeof seedBearerSchema>;
export type SeedGrant = z.infer<typeof seedGrantSchema>;
export type SeedFile = z.infer<typeof seedFileSchema>;
