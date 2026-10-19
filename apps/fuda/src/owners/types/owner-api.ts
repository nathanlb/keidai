import { z } from "zod";

export const resolveOrProvisionOwnerBodySchema = z
  .object({
    idpIssuer: z.string().min(1),
    idpSub: z.string().min(1),
    email: z.string().email(),
    displayName: z.string().min(1).optional(),
    pictureUrl: z.string().min(1).optional(),
    ownerId: z.string().min(1).optional(),
    role: z.enum(["admin", "member"]).optional(),
  })
  .strict();

export const updateOwnerBodySchema = z
  .object({
    status: z.enum(["active", "disabled"]).optional(),
    role: z.enum(["admin", "member"]).optional(),
  })
  .strict()
  .refine((body) => body.status !== undefined || body.role !== undefined, {
    message: "status or role is required",
  });

export type ResolveOrProvisionOwnerBody = z.infer<
  typeof resolveOrProvisionOwnerBodySchema
>;
export type UpdateOwnerBody = z.infer<typeof updateOwnerBodySchema>;
