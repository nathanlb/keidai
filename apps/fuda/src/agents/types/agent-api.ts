import { z } from "zod";
import type { AgentRecord } from "./agent-repository.js";

/** Management-facing agent view: identity fields plus current persona content. */
export interface ManagementAgent extends AgentRecord {
  persona: string;
}

/** Shaiden-facing definition view — no identity fields. */
export interface AgentDefinition {
  name: string;
  slug: string;
  persona: string;
  personaVersion: number;
}

export const createAgentBodySchema = z.object({
  id: z.string().min(1).optional(),
  slug: z.string().min(1),
  name: z.string().min(1),
  ownerId: z.string().min(1),
  groups: z.array(z.string().min(1)).default([]),
  persona: z.string().min(1),
});

export const updateAgentBodySchema = z
  .object({
    name: z.string().min(1).optional(),
    groups: z.array(z.string().min(1)).optional(),
    persona: z.string().min(1).optional(),
    /** Rejected — slug is immutable after creation. */
    slug: z.unknown().optional(),
    /** Rejected — owner is fixed at registration. */
    ownerId: z.unknown().optional(),
  })
  .strict();

export type CreateAgentBody = z.infer<typeof createAgentBodySchema>;
export type UpdateAgentBody = z.infer<typeof updateAgentBodySchema>;
