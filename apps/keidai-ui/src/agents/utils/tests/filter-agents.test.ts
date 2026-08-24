import { describe, expect, it } from "vitest";
import type { ManagementAgent } from "../../../lib/api/agents.js";
import { filterAgents } from "../filter-agents.js";

function makeAgent(overrides: Partial<ManagementAgent>): ManagementAgent {
  return {
    id: "agt_1",
    slug: "demo-agent",
    name: "Demo Agent",
    ownerId: "nathanlb",
    groups: [],
    persona: "You are a demo agent.",
    currentPersonaVersion: 1,
    createdAt: "2026-06-02T00:00:00.000Z",
    updatedAt: "2026-06-02T00:00:00.000Z",
    ...overrides,
  };
}

describe("filterAgents", () => {
  const agents = [
    makeAgent({
      id: "agt_1",
      name: "Demo Agent",
      slug: "demo-agent",
      groups: ["newsletter-writers"],
    }),
    makeAgent({
      id: "agt_2",
      name: "Triage Bot",
      slug: "triage-bot",
      groups: ["triage"],
    }),
  ];

  it("returns all agents for an empty query", () => {
    expect(filterAgents(agents, "")).toHaveLength(2);
    expect(filterAgents(agents, "   ")).toHaveLength(2);
  });

  it("matches by name case-insensitively", () => {
    expect(filterAgents(agents, "triage")).toEqual([agents[1]]);
  });

  it("matches by slug", () => {
    expect(filterAgents(agents, "demo-agent")).toEqual([agents[0]]);
  });

  it("matches by group", () => {
    expect(filterAgents(agents, "newsletter-writers")).toEqual([agents[0]]);
  });

  it("returns an empty array when nothing matches", () => {
    expect(filterAgents(agents, "no-match")).toEqual([]);
  });
});
