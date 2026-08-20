import { registryKey } from "./registry-key.js";

/**
 * Parses `FUDA_K8S_SA_OIDC_SUBJECTS`.
 *
 * Format: `namespace/serviceAccount,...` (no `=bearer_id`).
 *
 * Keys are stored as kind-prefixed registry keys
 * (`k8s_service_account:namespace/serviceAccount`).
 *
 * Returns a set, an error string, or `null` when unset.
 */
export function parseK8sSaSubjects(
  raw: string | undefined,
): ReadonlySet<string> | string | null {
  if (raw === undefined || raw.trim() === "") {
    return null;
  }

  const parts = raw
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  if (parts.length === 0) {
    return "FUDA_K8S_SA_OIDC_SUBJECTS must list at least one namespace/serviceAccount entry";
  }

  const subjects = new Set<string>();

  for (const part of parts) {
    if (part.includes("=")) {
      return "Invalid FUDA_K8S_SA_OIDC_SUBJECTS entry: expected namespace/serviceAccount (not namespace/serviceAccount=bearer_id)";
    }

    const slash = part.indexOf("/");
    if (slash <= 0 || slash === part.length - 1) {
      return "Invalid FUDA_K8S_SA_OIDC_SUBJECTS entry: expected namespace/serviceAccount";
    }

    const namespace = part.slice(0, slash);
    const serviceAccountName = part.slice(slash + 1);
    if (
      namespace.includes("/") ||
      serviceAccountName.length === 0 ||
      namespace.length === 0
    ) {
      return "Invalid FUDA_K8S_SA_OIDC_SUBJECTS entry: expected namespace/serviceAccount";
    }

    const key = registryKey({
      kind: "k8s_service_account",
      namespace,
      serviceAccountName,
    });

    if (subjects.has(key)) {
      return "Duplicate subject in FUDA_K8S_SA_OIDC_SUBJECTS";
    }

    subjects.add(key);
  }

  return subjects;
}
