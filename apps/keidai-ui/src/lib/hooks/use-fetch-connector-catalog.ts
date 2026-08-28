import useSWR from "swr";
import { fetchConnectorCatalog } from "../api/gateway.js";

export const CONNECTOR_CATALOG_KEY = "connector-catalog";

const swrOptions = { onError: () => undefined } as const;

export function useFetchConnectorCatalog() {
  const { data, error, isLoading, mutate } = useSWR(
    CONNECTOR_CATALOG_KEY,
    fetchConnectorCatalog,
    swrOptions,
  );

  return { data, error, isLoading, refresh: mutate };
}
