import type { ConfigAgentsResponse } from "@keidai/shared";
import type { MockToriiConfig } from "../helpers/mock-torii.js";

const alphaK8sSubject = {
  kind: "k8s_service_account" as const,
  namespace: "agents",
  service_account: "alpha",
};

export const alphaAgent: ConfigAgentsResponse["agents"][number] = {
  agent_id: "alpha",
  owner_id: "owner-a",
  subject: alphaK8sSubject,
  groups: [],
};

export const singleAlphaAgentConfig: Pick<MockToriiConfig, "agents"> = {
  agents: { agents: [alphaAgent] },
};
