import useSWR from "swr";
import { fetchConnectors } from "../api/gateway.js";

export const CONNECTORS_KEY = "torii-connectors";

const swrOptions = { onError: () => undefined } as const;

export function useFetchConnectors() {
  const { data, error, isLoading, mutate } = useSWR(
    CONNECTORS_KEY,
    fetchConnectors,
    swrOptions,
  );

  return { data, error, isLoading, refresh: mutate };
}
