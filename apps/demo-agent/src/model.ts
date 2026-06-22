import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

export function createOpenRouterModel(
  apiKey: string,
  modelId: string,
): LanguageModel {
  const openrouter = createOpenAI({
    baseURL: OPENROUTER_BASE_URL,
    apiKey,
    headers: {
      "X-Title": "Keidai Demo Agent",
    },
  });

  return openrouter.chat(modelId);
}
