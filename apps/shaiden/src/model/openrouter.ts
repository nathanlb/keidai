import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

/**
 * OpenRouter omits `usage.cost` unless the chat request sets
 * `usage.include`. `@ai-sdk/openai` has no option for that flag and drops
 * unknown usage keys, so the flag is added here and cost is read from the
 * raw response body.
 */
export function withOpenRouterUsageAccounting(
  fetchImpl: typeof fetch = globalThis.fetch,
): typeof fetch {
  return async (input, init) => {
    if (init?.body && typeof init.body === "string") {
      try {
        const parsed: unknown = JSON.parse(init.body);
        if (parsed && typeof parsed === "object" && "messages" in parsed) {
          const record = parsed as Record<string, unknown>;
          const existing = record.usage;
          record.usage = {
            ...(existing && typeof existing === "object" ? existing : {}),
            include: true,
          };
          return fetchImpl(input, { ...init, body: JSON.stringify(record) });
        }
      } catch {
        // Non-JSON bodies are sent unchanged.
      }
    }
    return fetchImpl(input, init);
  };
}

export function readOpenRouterCost(body: unknown): number | undefined {
  if (!body || typeof body !== "object") {
    return undefined;
  }
  const usage = (body as { usage?: unknown }).usage;
  if (!usage || typeof usage !== "object") {
    return undefined;
  }
  const cost = (usage as { cost?: unknown }).cost;
  if (typeof cost !== "number" || !Number.isFinite(cost) || cost < 0) {
    return undefined;
  }
  return cost;
}

export function createOpenRouterModel(
  apiKey: string,
  modelId: string,
): LanguageModel {
  const openrouter = createOpenAI({
    baseURL: OPENROUTER_BASE_URL,
    apiKey,
    headers: {
      "X-Title": "Keidai Shaiden",
    },
    fetch: withOpenRouterUsageAccounting(),
  });

  return openrouter.chat(modelId);
}
