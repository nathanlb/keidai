import { z } from "zod";
import { CONNECTOR_SLUG_PATTERN } from "@keidai/shared";

const oauthBodySchema = z
  .object({
    issuer: z.string().min(1).optional(),
    authorizeUrl: z.string().min(1).optional(),
    tokenUrl: z.string().min(1).optional(),
    scopes: z.array(z.string()).optional(),
    clientId: z.string().min(1).optional(),
    clientSecret: z.string().min(1).optional(),
    authorizeParams: z.record(z.string(), z.string()).optional(),
  })
  .strict();

export const createConnectorBodySchema = z
  .object({
    slug: z.string().regex(CONNECTOR_SLUG_PATTERN, "invalid slug"),
    displayName: z.string().min(1),
    url: z.string().url(),
    authMode: z.enum(["user_oauth", "service_key", "none"]),
    icon: z.string().min(1).optional(),
    serviceKey: z.string().min(1).optional(),
    serviceKeyHeader: z.string().min(1).optional(),
    serviceKeyEnvRef: z.string().min(1).optional(),
    oauth: oauthBodySchema.optional(),
  })
  .strict();

export const updateConnectorBodySchema = z
  .object({
    displayName: z.string().min(1).optional(),
    url: z.string().url().optional(),
    enabled: z.boolean().optional(),
    icon: z.string().min(1).nullable().optional(),
    serviceKey: z.string().min(1).nullable().optional(),
    serviceKeyHeader: z.string().min(1).nullable().optional(),
    serviceKeyEnvRef: z.string().min(1).optional(),
    oauth: oauthBodySchema.nullable().optional(),
  })
  .strict();

export const installCatalogBodySchema = z
  .object({
    catalogId: z.string().min(1),
    slug: z.string().regex(CONNECTOR_SLUG_PATTERN).optional(),
    serviceKey: z.string().min(1).optional(),
    serviceKeyEnvRef: z.string().min(1).optional(),
    oauthClient: z
      .object({
        clientId: z.string().min(1),
        clientSecret: z.string().min(1),
      })
      .strict()
      .optional(),
  })
  .strict();

export type CreateConnectorBody = z.infer<typeof createConnectorBodySchema>;
export type UpdateConnectorBody = z.infer<typeof updateConnectorBodySchema>;
export type InstallCatalogBody = z.infer<typeof installCatalogBodySchema>;
