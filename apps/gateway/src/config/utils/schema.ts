import { z } from "zod";
import type { ToriiConfig } from "@torii/shared";

const oauthProviderSchema = z.object({
  token_url: z.string().min(1, "token_url is required"),
  client_id: z.string().min(1, "client_id is required"),
  client_secret: z.string().min(1, "client_secret is required"),
  scopes: z.array(z.string()),
});

const credentialSchema = z.discriminatedUnion("strategy", [
  z.object({
    strategy: z.literal("oauth_obo"),
    provider: z.string().min(1, "provider is required"),
    subject: z.string().min(1, "subject is required"),
  }),
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

const policySchema = z.object({
  default: z.enum(["allow", "deny"]),
  allow: z.array(z.string()).optional(),
  deny: z.array(z.string()).optional(),
});

const serverSchema = z.object({
  name: z.string().min(1, "name is required"),
  transport: z.object({
    type: z.literal("http"),
    url: z.string().min(1, "url is required"),
  }),
  credential: credentialSchema,
  policy: policySchema,
});

export const toriiConfigSchema = z
  .object({
    oauth_providers: z.record(z.string(), oauthProviderSchema),
    servers: z.array(serverSchema).min(1, "at least one server is required"),
  })
  .superRefine((config, ctx) => {
    const seenNames = new Map<string, number>();

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

      if (server.credential.strategy === "oauth_obo") {
        if (!(server.credential.provider in config.oauth_providers)) {
          ctx.addIssue({
            code: "custom",
            message: `server "${server.name}": oauth_obo provider "${server.credential.provider}" is not defined in oauth_providers`,
            path: ["servers", index, "credential", "provider"],
          });
        }
      }
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
