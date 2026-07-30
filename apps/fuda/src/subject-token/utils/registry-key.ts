import type { ValidatedK8sSaSubject } from "../types/validated-k8s-sa-subject.js";

/**
 * Stable map key for a validated SA subject.
 * Includes `kind` so a second subject kind cannot collide silently.
 */
export function registryKey(subject: ValidatedK8sSaSubject): string {
  return `${subject.kind}:${subject.namespace}/${subject.serviceAccountName}`;
}
