import type { ToriiConfig } from "@keidai/shared";

export function resolveOAuthOwnerId(
  config: ToriiConfig,
  ownerIdFlag: string | undefined,
): string {
  if (ownerIdFlag) {
    return ownerIdFlag;
  }

  const agents = config.agents ?? [];
  if (agents.length === 1) {
    return agents[0]!.owner_id;
  }

  if (agents.length === 0) {
    throw new Error(
      "No agents configured. Pass ?owner=<owner_id> to specify the token owner.",
    );
  }

  throw new Error(
    `Multiple agents configured. Pass ?owner=<owner_id> (available: ${agents.map((agent) => agent.owner_id).join(", ")})`,
  );
}
