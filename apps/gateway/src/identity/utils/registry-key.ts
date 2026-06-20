import type { ValidatedAgentSubject } from "../types/validated-agent-subject.js";

export function registryKey(subject: ValidatedAgentSubject): string {
  return `${subject.namespace}/${subject.serviceAccountName}`;
}
