import type { PublicAgentConfig } from "@keidai/shared";
import { describe, expect, it } from "vitest";
import { groupAgentsByOwner } from "../group-agents-by-owner.js";

const subject = {
  kind: "k8s_service_account" as const,
  namespace: "agents",
  service_account: "demo",
};

function agent(
  agentId: string,
  ownerId: string,
  groups: string[] = [],
): PublicAgentConfig {
  return {
    agent_id: agentId,
    owner_id: ownerId,
    subject,
    groups,
  };
}

describe("groupAgentsByOwner", () => {
  it("groups agents by owner_id and sorts owners and agents", () => {
    const groups = groupAgentsByOwner([
      agent("beta", "owner-b"),
      agent("alpha", "owner-a"),
      agent("gamma", "owner-a"),
    ]);

    expect(groups).toEqual([
      {
        ownerId: "owner-a",
        agents: [agent("alpha", "owner-a"), agent("gamma", "owner-a")],
      },
      {
        ownerId: "owner-b",
        agents: [agent("beta", "owner-b")],
      },
    ]);
  });

  it("returns an empty list when there are no agents", () => {
    expect(groupAgentsByOwner([])).toEqual([]);
  });
});
