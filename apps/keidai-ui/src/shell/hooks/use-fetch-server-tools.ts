import type { ServerToolView, ServerToolsResponse } from "@keidai/shared";
import useSWR from "swr";
import { fetchServerTools } from "../../torii/api/torii-client.js";

export const SERVER_TOOLS_KEY = "server-tools";

const swrOptions = { onError: () => undefined } as const;

export function useFetchServerTools(
  serverName: string | null,
  enabled: boolean,
): {
  tools: ServerToolView[];
  error: Error | undefined;
  isLoading: boolean;
  refresh: ReturnType<typeof useSWR<ServerToolsResponse>>["mutate"];
} {
  const { data, error, isLoading, mutate } = useSWR<ServerToolsResponse>(
    enabled && serverName ? [SERVER_TOOLS_KEY, serverName] : null,
    () => fetchServerTools(serverName!),
    swrOptions,
  );

  return {
    tools: data?.tools ?? [],
    error,
    isLoading,
    refresh: mutate,
  };
}
