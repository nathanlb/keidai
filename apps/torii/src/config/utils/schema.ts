import { z } from "zod";
import type { ToriiConfig } from "@keidai/shared";

const oauthProviderSchema = z
  .object({
    token_url: z.string().min(1, "token_url is required"),
    authorize_url: z.string().min(1).optional(),
    client_id: z.string().min(1).optional(),
    client_secret: z.string().min(1).optional(),
    scopes: z.array(z.string()),
    registration_endpoint: z.string().min(1).optional(),
    authorize_params: z.record(z.string(), z.string()).optional(),
    token_client_auth: z.enum(["body", "basic"]).optional(),
    token_body_format: z.enum(["form", "json"]).optional(),
    pkce: z.boolean().optional(),
  })
  .superRefine((provider, ctx) => {
    if (provider.registration_endpoint) {
      return;
    }

    if (!provider.client_id) {
      ctx.addIssue({
        code: "custom",
        message: "client_id is required unless registration_endpoint is set",
        path: ["client_id"],
      });
    }

    if (!provider.client_secret) {
      ctx.addIssue({
        code: "custom",
        message:
          "client_secret is required unless registration_endpoint is set",
        path: ["client_secret"],
      });
    }
  });

const credentialSchema = z.discriminatedUnion("strategy", [
  z
    .object({
      strategy: z.literal("user_oauth"),
      provider: z.string().min(1, "provider is required"),
    })
    .strict(),
  z.object({
    strategy: z.literal("service_key"),
    key: z.string().min(1, "key is required for service_key credential strategy"),
    inject: z
      .object({
        header: z.string().min(1, "inject.header is required when inject is set"),
      })
      .optional(),
  }),
  z
    .object({
      strategy: z.literal("none"),
    })
    .strict(),
]);

const groupPermissionSchema = z
  .object({
    server: z.string().min(1, "server is required"),
    tools: z.array(z.string().min(1)),
  })
  .strict();

const groupDefinitionSchema = z
  .object({
    name: z.string().min(1, "name is required"),
    description: z.string().min(1, "description is required"),
    permissions: z.array(groupPermissionSchema),
  })
  .strict();

const serverSchema = z
  .object({
    name: z.string().min(1, "name is required"),
    transport: z.object({
      type: z.literal("http"),
      url: z.string().min(1, "url is required"),
    }),
    credential: credentialSchema,
  })
  .strict();

export const toriiConfigSchema = z
  .object({
    gateway_base_url: z.string().url().optional(),
    oauth_providers: z.record(z.string(), oauthProviderSchema),
    servers: z.array(serverSchema).min(1, "at least one server is required"),
    groups: z.array(groupDefinitionSchema).default([]),
    gated_tools: z
      .record(z.string().min(1), z.array(z.string().min(1)))
      .default({}),
  })
  .strict()
  .superRefine((config, ctx) => {
    const seenNames = new Map<string, number>();
    const seenGroupNames = new Map<string, number>();
    const serverNames = new Set(config.servers.map((server) => server.name));

    config.servers.forEach((server, index) => {
      const firstIndex = seenNames.get(server.name);
      if (firstIndex !== undefined) {
        ctx.addIssue({
          code: "custom",
          message: `duplicate server name "${server.name}" (also defined at servers[${firstIndex}])`,
          path: ["servers", index, "name"],
        });
      } else {
        seenNames.set(server.name, index);
      }

      if (server.credential.strategy === "user_oauth") {
        if (!(server.credential.provider in config.oauth_providers)) {
          ctx.addIssue({
            code: "custom",
            message: `server "${server.name}": user_oauth provider "${server.credential.provider}" is not defined in oauth_providers`,
            path: ["servers", index, "credential", "provider"],
          });
        }
      }
    });

    config.groups.forEach((group, index) => {
      const firstGroupIndex = seenGroupNames.get(group.name);
      if (firstGroupIndex !== undefined) {
        ctx.addIssue({
          code: "custom",
          message: `duplicate group name "${group.name}" (also defined at groups[${firstGroupIndex}])`,
          path: ["groups", index, "name"],
        });
      } else {
        seenGroupNames.set(group.name, index);
      }

      group.permissions.forEach((permission, permissionIndex) => {
        if (!serverNames.has(permission.server)) {
          ctx.addIssue({
            code: "custom",
            message: `group "${group.name}": permission server "${permission.server}" is not defined in servers`,
            path: ["groups", index, "permissions", permissionIndex, "server"],
          });
        }
      });
    });
  });

export function formatSchemaIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const path =
      issue.path.length > 0 ? issue.path.map(String).join(".") : "config";
    return `${path}: ${issue.message}`;
  });
}

export function parseToriiConfig(value: unknown): ToriiConfig {
  return toriiConfigSchema.parse(value);
}
