import { describe, expect, it, vi } from "vitest";
import { refreshToriiConfig } from "../refresh-torii-config.js";
import { AGENTS_KEY } from "../use-fetch-agents.js";
import { OAUTH_CONNECTIONS_KEY_PREFIX } from "../use-fetch-oauth-connections.js";
import { OAUTH_PROVIDERS_KEY } from "../use-fetch-oauth-providers.js";
import { SERVERS_KEY } from "../use-fetch-servers.js";
import { CONNECTORS_KEY } from "../use-fetch-connectors.js";
import { TASKS_KEY } from "../../../tasks/hooks/use-fetch-tasks.js";
import { RUNS_VISIBILITY_KEY } from "../../../runs/hooks/use-runs-visibility.js";
import { TORII_STATUS_KEY, SHAIDEN_STATUS_KEY } from "../backend-health.js";
import { FUDA_STATUS_KEY } from "../use-fuda-status.js";
import { GROUPS_KEY } from "../../../groups/hooks/use-fetch-groups.js";
import { TORII_GROUPS_KEY } from "../../../agents/hooks/use-fetch-torii-groups.js";

describe("refreshToriiConfig", () => {
  it("revalidates config and oauth connection caches", () => {
    const mutate = vi.fn().mockResolvedValue(undefined);

    refreshToriiConfig(mutate);

    expect(mutate).toHaveBeenCalledWith(
      TORII_STATUS_KEY,
      undefined,
      { revalidate: true },
    );
    expect(mutate).toHaveBeenCalledWith(
      SHAIDEN_STATUS_KEY,
      undefined,
      { revalidate: true },
    );
    expect(mutate).toHaveBeenCalledWith(
      FUDA_STATUS_KEY,
      undefined,
      { revalidate: true },
    );
    expect(mutate).toHaveBeenCalledWith(AGENTS_KEY, undefined, {
      revalidate: true,
    });
    expect(mutate).toHaveBeenCalledWith(SERVERS_KEY, undefined, {
      revalidate: true,
    });
    expect(mutate).toHaveBeenCalledWith(CONNECTORS_KEY, undefined, {
      revalidate: true,
    });
    expect(mutate).toHaveBeenCalledWith(GROUPS_KEY, undefined, {
      revalidate: true,
    });
    expect(mutate).toHaveBeenCalledWith(TORII_GROUPS_KEY, undefined, {
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
    expect(mutate).toHaveBeenCalledWith(TASKS_KEY, undefined, {
      revalidate: true,
    });
    expect(mutate).toHaveBeenCalledWith(RUNS_VISIBILITY_KEY, undefined, {
      revalidate: true,
    });
  });
});
