import useSWR from "swr";
import { fetchOAuthProviders } from "../../torii/api/gateway-client.js";

export const OAUTH_PROVIDERS_KEY = "oauth-providers";

const swrOptions = { onError: () => undefined } as const;

export function useFetchOAuthProviders() {
  const { data, error, isLoading, mutate } = useSWR(
    OAUTH_PROVIDERS_KEY,
    fetchOAuthProviders,
    swrOptions,
  );

  return { data, error, isLoading, refresh: mutate };
}
