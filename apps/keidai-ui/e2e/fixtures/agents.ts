import type { ManagementAgent } from "../../src/fuda/api/fuda-client.js";
import type { MockToriiConfig } from "../helpers/mock-torii.js";

export const alphaAgent: ManagementAgent = {
  id: "agt-alpha",
  slug: "alpha",
  name: "Alpha",
  ownerId: "owner-a",
  groups: [],
  persona: "You are Alpha, a demo agent used in end-to-end tests.",
  currentPersonaVersion: 1,
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-01T00:00:00.000Z",
};

export const singleAlphaAgentConfig: Pick<MockToriiConfig, "fudaAgents"> = {
  fudaAgents: [alphaAgent],
};
