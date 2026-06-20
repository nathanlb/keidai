import type { AgentSubjectConfig } from "@torii/shared";
import type { ValidatedAgentSubject } from "../types/validated-agent-subject.js";

export function toValidatedAgentSubject(
  subject: AgentSubjectConfig,
): ValidatedAgentSubject {
  return {
    kind: "k8s_service_account",
    namespace: subject.namespace,
    serviceAccountName: subject.service_account,
  };
}
