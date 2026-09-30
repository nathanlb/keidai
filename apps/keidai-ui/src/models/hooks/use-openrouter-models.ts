import useSWR from "swr";
import { fetchOpenRouterModels } from "../../lib/api/openrouter.js";

export const OPENROUTER_MODELS_KEY = "openrouter-models";

export function useOpenRouterModels() {
  const { data, error, isLoading } = useSWR(
    OPENROUTER_MODELS_KEY,
    fetchOpenRouterModels,
    { onError: () => undefined },
  );

  return {
    models: data?.models ?? [],
    error: error instanceof Error ? error : null,
    isLoading,
  };
}
