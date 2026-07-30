import { SubjectTokenValidationError } from "../types/subject-token-validation-error.js";
import type { ValidatedK8sSaSubject } from "../types/validated-k8s-sa-subject.js";

const K8S_SA_SUBJECT_PATTERN =
  /^system:serviceaccount:(?<namespace>[^:]+):(?<name>.+)$/;

export function parseK8sSaSubject(subject: string): ValidatedK8sSaSubject {
  const match = K8S_SA_SUBJECT_PATTERN.exec(subject);
  const namespace = match?.groups?.namespace;
  const serviceAccountName = match?.groups?.name;

  if (!namespace || !serviceAccountName) {
    throw new SubjectTokenValidationError(
      "Token subject is not a Kubernetes service account",
    );
  }

  return {
    kind: "k8s_service_account",
    namespace,
    serviceAccountName,
  };
}
