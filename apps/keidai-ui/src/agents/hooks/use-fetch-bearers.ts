import useSWR from "swr";
import { fetchBearers } from "../../lib/api/agents.js";

export const BEARERS_KEY = "bearers";

const swrOptions = { onError: () => undefined } as const;

export function useFetchBearers() {
  const { data, error, isLoading, mutate } = useSWR(
    BEARERS_KEY,
    fetchBearers,
    swrOptions,
  );

  return { data, error, isLoading, refresh: mutate };
}
