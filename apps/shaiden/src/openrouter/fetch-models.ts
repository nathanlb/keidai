const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";

export async function fetchOpenRouterModels(
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
): Promise<unknown> {
  const response = await fetchImpl(OPENROUTER_MODELS_URL, {
    headers: {
      authorization: `Bearer ${apiKey}`,
      accept: "application/json",
    },
  });
  if (!response.ok) {
    throw new Error(`OpenRouter models request failed: ${response.status}`);
  }
  return response.json();
}
