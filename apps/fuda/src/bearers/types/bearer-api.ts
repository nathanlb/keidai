import { z } from "zod";

export const createBearerBodySchema = z.object({
  bearerId: z.string().min(1),
  displayName: z.string().min(1),
});

export const updateBearerBodySchema = z
  .object({
    displayName: z.string().min(1),
  })
  .strict();

export const createGrantBodySchema = z.object({
  agentId: z.string().min(1),
});

export type CreateBearerBody = z.infer<typeof createBearerBodySchema>;
export type UpdateBearerBody = z.infer<typeof updateBearerBodySchema>;
export type CreateGrantBody = z.infer<typeof createGrantBodySchema>;
