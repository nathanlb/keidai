import { registryKey } from "./registry-key.js";

/**
 * Parses `FUDA_K8S_SA_OIDC_SUBJECT_MAPPINGS`.
 *
 * Format: `namespace/serviceAccount=bearer_id,...`
 *
 * Keys are stored as kind-prefixed registry keys
 * (`k8s_service_account:namespace/serviceAccount`).
 *
 * Returns a map, an error string, or `null` when unset.
 */
export function parseK8sSaSubjectMappings(
  raw: string | undefined,
): ReadonlyMap<string, string> | string | null {
  if (raw === undefined || raw.trim() === "") {
    return null;
  }

  const parts = raw
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  if (parts.length === 0) {
    return "FUDA_K8S_SA_OIDC_SUBJECT_MAPPINGS must list at least one namespace/serviceAccount=bearer_id entry";
  }

  const mappings = new Map<string, string>();

  for (const part of parts) {
    const eq = part.indexOf("=");
    if (eq <= 0 || eq === part.length - 1) {
      return "Invalid FUDA_K8S_SA_OIDC_SUBJECT_MAPPINGS entry: expected namespace/serviceAccount=bearer_id";
    }

    const subjectKey = part.slice(0, eq).trim();
    const bearerId = part.slice(eq + 1).trim();
    if (subjectKey.length === 0 || bearerId.length === 0) {
      return "Invalid FUDA_K8S_SA_OIDC_SUBJECT_MAPPINGS entry: expected namespace/serviceAccount=bearer_id";
    }

    const slash = subjectKey.indexOf("/");
    if (slash <= 0 || slash === subjectKey.length - 1) {
      return "Invalid FUDA_K8S_SA_OIDC_SUBJECT_MAPPINGS entry: expected namespace/serviceAccount=bearer_id";
    }

    const namespace = subjectKey.slice(0, slash);
    const serviceAccountName = subjectKey.slice(slash + 1);
    if (
      namespace.includes("/") ||
      serviceAccountName.length === 0 ||
      namespace.length === 0
    ) {
      return "Invalid FUDA_K8S_SA_OIDC_SUBJECT_MAPPINGS entry: expected namespace/serviceAccount=bearer_id";
    }

    const key = registryKey({
      kind: "k8s_service_account",
      namespace,
      serviceAccountName,
    });

    if (mappings.has(key)) {
      return "Duplicate subject in FUDA_K8S_SA_OIDC_SUBJECT_MAPPINGS";
    }

    mappings.set(key, bearerId);
  }

  return mappings;
}
