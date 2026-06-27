import type { AgentSubjectConfig } from "@keidai/shared";

export function formatAgentSubject(subject: AgentSubjectConfig): string {
  switch (subject.kind) {
    case "k8s_service_account":
      return `k8s://${subject.namespace}/${subject.service_account}`;
  }
}
