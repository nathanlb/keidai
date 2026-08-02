import type { ManagementAgent } from "../../../../fuda/api/fuda-client.js";
import { describe, expect, it } from "vitest";
import { toAgentAssigneeOption } from "../to-agent-assignee-option.js";

const agent: ManagementAgent = {
  id: "shaiden-newsletter-01",
  slug: "shaiden",
  name: "Newsletter Writer",
  ownerId: "nathanlb",
  groups: [],
  persona: "You draft the weekly engineering newsletter.",
  currentPersonaVersion: 1,
  createdAt: "2026-06-02T00:00:00.000Z",
  updatedAt: "2026-06-02T00:00:00.000Z",
};

describe("toAgentAssigneeOption", () => {
  it("uses the agent's display name and derives initials from it", () => {
    expect(toAgentAssigneeOption(agent, "shaiden-newsletter-01")).toEqual({
      agentId: "shaiden-newsletter-01",
      displayName: "Newsletter Writer",
      initials: "NW",
      connected: true,
    });
  });

  it("falls back to the slug when name is empty", () => {
    expect(toAgentAssigneeOption({ ...agent, name: "" }).displayName).toBe(
      "shaiden",
    );
  });

  it("marks mismatched runtime agents as not connected", () => {
    expect(toAgentAssigneeOption(agent, "other-agent").connected).toBe(false);
  });

  it("marks agents as not connected when runtime is unknown", () => {
    expect(toAgentAssigneeOption(agent).connected).toBe(false);
  });
});
