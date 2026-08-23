import { z } from "zod";

const groupServerPolicySchema = z
  .object({
    server: z.string().min(1),
    default: z.enum(["allow", "deny"]).default("deny"),
    allow: z.array(z.string().min(1)).default([]),
    deny: z.array(z.string().min(1)).default([]),
    gated: z.array(z.string().min(1)).default([]),
  })
  .strict();

export const createGroupBodySchema = z
  .object({
    name: z.string().min(1),
    description: z.string().default(""),
    servers: z.array(groupServerPolicySchema).default([]),
  })
  .strict();

export const updateGroupBodySchema = z
  .object({
    description: z.string().optional(),
    servers: z.array(groupServerPolicySchema).optional(),
    /** Rejected — name is the Fuda join key and is immutable after create. */
    name: z.unknown().optional(),
  })
  .strict();

export type CreateGroupBody = z.infer<typeof createGroupBodySchema>;
export type UpdateGroupBody = z.infer<typeof updateGroupBodySchema>;
