import useSWR from "swr";
import { fetchServers } from "../../torii/api/gateway-client.js";

export const SERVERS_KEY = "config-servers";

const swrOptions = { onError: () => undefined } as const;

export function useFetchServers() {
  const { data, error, isLoading, mutate } = useSWR(
    SERVERS_KEY,
    fetchServers,
    swrOptions,
  );

  return { data, error, isLoading, refresh: mutate };
}
