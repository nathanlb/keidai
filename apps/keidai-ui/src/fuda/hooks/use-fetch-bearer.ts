import useSWR from "swr";
import { fetchBearer } from "../api/fuda-client.js";
import { bearerDetailKey } from "./swr-keys.js";

const swrOptions = { onError: () => undefined } as const;

export function useFetchBearer(bearerId: string | undefined) {
  const { data, error, isLoading, mutate } = useSWR(
    bearerId ? bearerDetailKey(bearerId) : null,
    () => fetchBearer(bearerId as string),
    swrOptions,
  );

  return { data, error, isLoading, refresh: mutate };
}
