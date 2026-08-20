import type { AgentRepository } from "../agents/types/agent-repository.js";
import { PLATFORM_BEARER_ID } from "./platform-bearer.js";
import type { BearerRepository } from "./types/bearer-repository.js";

export interface EnsurePlatformBearerResult {
  bearerCreated: boolean;
  grantsEnsured: number;
}

/**
 * Upserts the platform runner bearer and grants it to every agent.
 * Does not overwrite an existing display name.
 */
export async function ensurePlatformBearer(
  bearers: BearerRepository,
  agents: AgentRepository,
): Promise<EnsurePlatformBearerResult> {
  const existing = await bearers.get(PLATFORM_BEARER_ID);
  let bearerCreated = false;
  if (!existing) {
    await bearers.create({
      bearerId: PLATFORM_BEARER_ID,
      displayName: PLATFORM_BEARER_ID,
    });
    bearerCreated = true;
  }

  let grantsEnsured = 0;
  for (const agent of await agents.list()) {
    if (await bearers.hasGrant(PLATFORM_BEARER_ID, agent.id)) {
      continue;
    }
    await bearers.ensureGrant(PLATFORM_BEARER_ID, agent.id);
    grantsEnsured += 1;
  }

  return { bearerCreated, grantsEnsured };
}
