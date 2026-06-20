import { IdentityResolutionError } from "../types/identity-resolution-error.js";
import type { ValidatedAgentSubject } from "../types/validated-agent-subject.js";

const K8S_SA_SUBJECT_PATTERN =
  /^system:serviceaccount:(?<namespace>[^:]+):(?<name>.+)$/;

export function parseK8sSaSubject(subject: string): ValidatedAgentSubject {
  const match = K8S_SA_SUBJECT_PATTERN.exec(subject);
  const namespace = match?.groups?.namespace;
  const serviceAccountName = match?.groups?.name;

  if (!namespace || !serviceAccountName) {
    throw new IdentityResolutionError(
      "Token subject is not a Kubernetes service account",
    );
  }

  return {
    kind: "k8s_service_account",
    namespace,
    serviceAccountName,
  };
}
