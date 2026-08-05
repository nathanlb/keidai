import type { ScopedMutator } from "swr";
import { AGENTS_KEY } from "../../shell/hooks/use-fetch-agents.js";
import { agentGrantsKey } from "./use-fetch-agent-grants.js";
import { BEARERS_KEY } from "./use-fetch-bearers.js";
import {
  bearerDetailKey,
  isAgentListExtrasKey,
  isBearerListExtrasKey,
} from "./swr-keys.js";

type Mutate = ScopedMutator;

function isGrantRelatedListExtrasKey(key: unknown): boolean {
  return isBearerListExtrasKey(key) || isAgentListExtrasKey(key);
}

/**
 * Grants are written from either Agents → Access or Bearers → Grants.
 * Invalidate both sides (and list extras) so neither needs a hard reload.
 */
export async function invalidateGrantCaches(
  mutate: Mutate,
  opts: { bearerId: string; agentId: string },
): Promise<void> {
  await Promise.all([
    mutate(BEARERS_KEY),
    mutate(AGENTS_KEY),
    mutate(bearerDetailKey(opts.bearerId)),
    mutate(agentGrantsKey(opts.agentId)),
    mutate(isGrantRelatedListExtrasKey),
  ]);
}

export async function invalidateBearerCaches(
  mutate: Mutate,
  bearerId?: string,
): Promise<void> {
  await Promise.all([
    mutate(BEARERS_KEY),
    mutate(isGrantRelatedListExtrasKey),
    ...(bearerId ? [mutate(bearerDetailKey(bearerId))] : []),
  ]);
}
