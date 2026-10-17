import { z } from "zod";

export const resolveOrProvisionOwnerBodySchema = z
  .object({
    idpIssuer: z.string().min(1),
    idpSub: z.string().min(1),
    email: z.string().email(),
    displayName: z.string().min(1).optional(),
    pictureUrl: z.string().min(1).optional(),
    ownerId: z.string().min(1).optional(),
  })
  .strict();

export const updateOwnerBodySchema = z
  .object({
    status: z.enum(["active", "disabled"]),
  })
  .strict();

export type ResolveOrProvisionOwnerBody = z.infer<
  typeof resolveOrProvisionOwnerBodySchema
>;
export type UpdateOwnerBody = z.infer<typeof updateOwnerBodySchema>;
