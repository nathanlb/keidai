import type { PublicAgentConfig } from "@keidai/shared";
import { describe, expect, it } from "vitest";
import { toAgentAssigneeOption } from "../to-agent-assignee-option.js";

const agent: PublicAgentConfig = {
  agent_id: "shaiden-newsletter-01",
  owner_id: "nathanlb",
  subject: {
    kind: "k8s_service_account",
    namespace: "agents",
    service_account: "shaiden",
  },
  groups: [],
};

describe("toAgentAssigneeOption", () => {
  it("uses the service account as the display name", () => {
    expect(toAgentAssigneeOption(agent, "shaiden-newsletter-01")).toEqual({
      agentId: "shaiden-newsletter-01",
      displayName: "shaiden",
      initials: "SH",
      connected: true,
    });
  });

  it("marks mismatched runtime agents as not connected", () => {
    expect(toAgentAssigneeOption(agent, "other-agent").connected).toBe(false);
  });

  it("marks agents as not connected when runtime is unknown", () => {
    expect(toAgentAssigneeOption(agent).connected).toBe(false);
  });
});
