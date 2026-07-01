import { describe, expect, it, vi } from "vitest";
import { refreshGatewayConfig } from "../refresh-gateway-config.js";
import { AGENTS_KEY } from "../use-fetch-agents.js";
import { OAUTH_CONNECTIONS_KEY_PREFIX } from "../use-fetch-oauth-connections.js";
import { OAUTH_PROVIDERS_KEY } from "../use-fetch-oauth-providers.js";
import { SERVERS_KEY } from "../use-fetch-servers.js";
import { GATEWAY_STATUS_KEY } from "../use-gateway-status.js";

describe("refreshGatewayConfig", () => {
  it("revalidates config and oauth connection caches", () => {
    const mutate = vi.fn().mockResolvedValue(undefined);

    refreshGatewayConfig(mutate);

    expect(mutate).toHaveBeenCalledWith(
      GATEWAY_STATUS_KEY,
      undefined,
      { revalidate: true },
    );
    expect(mutate).toHaveBeenCalledWith(AGENTS_KEY, undefined, {
      revalidate: true,
    });
    expect(mutate).toHaveBeenCalledWith(SERVERS_KEY, undefined, {
      revalidate: true,
    });
    expect(mutate).toHaveBeenCalledWith(OAUTH_PROVIDERS_KEY, undefined, {
      revalidate: true,
    });

    const oauthMatcher = mutate.mock.calls.find(
      ([key]) => typeof key === "function",
    )?.[0] as ((key: unknown) => boolean) | undefined;
    expect(oauthMatcher).toBeTypeOf("function");
    expect(oauthMatcher?.([OAUTH_CONNECTIONS_KEY_PREFIX, "owner-a"])).toBe(
      true,
    );
    expect(oauthMatcher?.("agents")).toBe(false);
  });
});
