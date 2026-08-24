import type { ServerToolsResponse } from "@keidai/shared";
import useSWR from "swr";
import { fetchServerTools } from "../../lib/api/gateway.js";
import type { ServerCatalogue } from "../types/group-editor.js";

export const SERVER_CATALOGUES_KEY = "server-catalogues";

const swrOptions = { onError: () => undefined } as const;

async function loadCatalogues(
  names: readonly string[],
): Promise<Record<string, ServerCatalogue>> {
  const entries = await Promise.all(
    names.map(async (name) => {
      try {
        const response: ServerToolsResponse = await fetchServerTools(name);
        return [
          name,
          {
            tools: response.tools.map((tool) => ({
              name: tool.name,
              description: tool.description,
            })),
            available: response.tools.length > 0,
            unavailableReason:
              response.tools.length === 0
                ? "No tools reported by this backend. Existing rules stay editable."
                : undefined,
          } satisfies ServerCatalogue,
        ] as const;
      } catch {
        return [
          name,
          {
            tools: [],
            available: false,
            unavailableReason:
              "Connection failed — reconnect the backend to add rules from its live catalogue.",
          } satisfies ServerCatalogue,
        ] as const;
      }
    }),
  );
  return Object.fromEntries(entries);
}

export function useFetchServerCatalogues(serverNames: readonly string[]) {
  const key =
    serverNames.length > 0
      ? [SERVER_CATALOGUES_KEY, ...[...serverNames].sort()]
      : null;

  const { data, error, isLoading, mutate } = useSWR(
    key,
    () => loadCatalogues(serverNames),
    swrOptions,
  );

  return {
    catalogues: data ?? {},
    error,
    isLoading,
    refresh: mutate,
  };
}
