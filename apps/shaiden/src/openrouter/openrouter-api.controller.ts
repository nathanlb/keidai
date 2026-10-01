import { createHash } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { fetchOpenRouterModels } from "./fetch-models.js";
import {
  describeOpenRouterCredential,
  OpenRouterNotConfiguredError,
  resolveOpenRouterApiKey,
  storeOpenRouterApiKey,
} from "./resolve-api-key.js";
import { selectToolUseModels } from "./select-tool-use-models.js";
import type {
  OpenRouterCredentialRepository,
  OpenRouterModelOption,
} from "./types.js";

const putBodySchema = z.object({
  apiKey: z.string().trim().min(20).max(500),
});

const MODEL_CACHE_MS = 5 * 60 * 1000;

export interface OpenRouterApiControllerOptions {
  credentials: OpenRouterCredentialRepository;
  /** `OPEN_ROUTER_API_KEY`, used when nothing is stored. */
  envFallback?: string;
  env?: NodeJS.ProcessEnv;
  fetchModels?: (apiKey: string) => Promise<unknown>;
  now?: () => number;
}

export class OpenRouterApiController {
  private cache: {
    fingerprint: string;
    at: number;
    models: OpenRouterModelOption[];
  } | null = null;

  constructor(private readonly options: OpenRouterApiControllerOptions) {}

  registerRoutes(app: FastifyInstance): void {
    app.get("/api/openrouter/credential", async (_request, reply) => {
      reply.send(await this.status());
    });

    app.put("/api/openrouter/credential", async (request, reply) => {
      const parsed = putBodySchema.safeParse(request.body);
      if (!parsed.success) {
        reply.code(400).send({ error: "invalid OpenRouter API key" });
        return;
      }

      try {
        const status = await storeOpenRouterApiKey({
          credentials: this.options.credentials,
          apiKey: parsed.data.apiKey,
          env: this.options.env,
        });
        this.cache = null;
        reply.send(status);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const status = message.includes("SHAIDEN_SECRET_KEY") ? 503 : 500;
        reply.code(status).send({
          error:
            status === 503 ? message : "Failed to store the OpenRouter API key",
        });
      }
    });

    app.delete("/api/openrouter/credential", async (_request, reply) => {
      await this.options.credentials.clear();
      this.cache = null;
      reply.send(await this.status());
    });

    app.get("/api/openrouter/models", async (_request, reply) => {
      try {
        reply.send({ models: await this.listModels() });
      } catch (error) {
        if (error instanceof OpenRouterNotConfiguredError) {
          reply.code(409).send({ error: error.message });
          return;
        }
        const message = error instanceof Error ? error.message : String(error);
        reply.code(502).send({ error: message });
      }
    });
  }

  private status() {
    return describeOpenRouterCredential({
      credentials: this.options.credentials,
      envFallback: this.options.envFallback,
    });
  }

  private async listModels(): Promise<OpenRouterModelOption[]> {
    const apiKey = await resolveOpenRouterApiKey({
      credentials: this.options.credentials,
      envFallback: this.options.envFallback,
      env: this.options.env,
    });
    const fingerprint = createHash("sha256").update(apiKey).digest("hex");
    const now = this.options.now?.() ?? Date.now();
    if (
      this.cache &&
      this.cache.fingerprint === fingerprint &&
      now - this.cache.at < MODEL_CACHE_MS
    ) {
      return this.cache.models;
    }

    const fetchModels = this.options.fetchModels ?? fetchOpenRouterModels;
    const models = selectToolUseModels(await fetchModels(apiKey));
    this.cache = { fingerprint, at: now, models };
    return models;
  }
}
