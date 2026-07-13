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

const policySchema = z.object({
  default: z.enum(["allow", "deny"]),
  allow: z.array(z.string()).optional(),
  deny: z.array(z.string()).optional(),
});

const k8sServiceAccountSubjectSchema = z
  .object({
    kind: z.literal("k8s_service_account"),
    namespace: z.string().min(1, "namespace is required"),
    service_account: z.string().min(1, "service_account is required"),
  })
  .strict();

const agentRegistrationSchema = z
  .object({
    subject: k8sServiceAccountSubjectSchema,
    agent_id: z.string().min(1, "agent_id is required"),
    owner_id: z.string().min(1, "owner_id is required"),
    groups: z.array(z.string()),
    inbound_token: z.string().min(1).optional(),
    gated_tools: z.array(z.string().min(1)).optional(),
  })
  .strict();

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
    gateway_base_url: z.string().url().optional(),
    oauth_providers: z.record(z.string(), oauthProviderSchema),
    servers: z.array(serverSchema).min(1, "at least one server is required"),
    agents: z.array(agentRegistrationSchema).default([]),
  })
  .superRefine((config, ctx) => {
    const seenNames = new Map<string, number>();
    const seenAgentSubjects = new Map<string, number>();
    const seenInboundTokens = new Map<string, number>();

    config.agents.forEach((agent, index) => {
      const subjectKey = `${agent.subject.namespace}/${agent.subject.service_account}`;
      const firstSubjectIndex = seenAgentSubjects.get(subjectKey);
      if (firstSubjectIndex !== undefined) {
        ctx.addIssue({
          code: "custom",
          message: `duplicate agent subject "${subjectKey}" (also defined at agents[${firstSubjectIndex}])`,
          path: ["agents", index, "subject"],
        });
      } else {
        seenAgentSubjects.set(subjectKey, index);
      }

      if (agent.inbound_token) {
        const firstTokenIndex = seenInboundTokens.get(agent.inbound_token);
        if (firstTokenIndex !== undefined) {
          ctx.addIssue({
            code: "custom",
            message: `duplicate agent inbound_token (also defined at agents[${firstTokenIndex}])`,
            path: ["agents", index, "inbound_token"],
          });
        } else {
          seenInboundTokens.set(agent.inbound_token, index);
        }
      }
    });

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
