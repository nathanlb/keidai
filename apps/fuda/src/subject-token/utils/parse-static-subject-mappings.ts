import type { StaticSubjectConfig } from "../types/static-subject-config.js";

/**
 * Parses `FUDA_STATIC_SUBJECT_MAPPINGS`.
 *
 * Format: `credential=bearer_id,credential=bearer_id`
 *
 * Returns a config object, an error string, or `null` when unset.
 */
export function parseStaticSubjectMappings(
  raw: string | undefined,
): StaticSubjectConfig | string | null {
  if (raw === undefined || raw.trim() === "") {
    return null;
  }

  const parts = raw
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  if (parts.length === 0) {
    return "FUDA_STATIC_SUBJECT_MAPPINGS must list at least one credential=bearer_id entry";
  }

  const mappings = new Map<string, string>();

  for (const part of parts) {
    const eq = part.indexOf("=");
    if (eq <= 0 || eq === part.length - 1) {
      return `Invalid FUDA_STATIC_SUBJECT_MAPPINGS entry: expected credential=bearer_id`;
    }

    const credential = part.slice(0, eq).trim();
    const bearerId = part.slice(eq + 1).trim();
    if (credential.length === 0 || bearerId.length === 0) {
      return `Invalid FUDA_STATIC_SUBJECT_MAPPINGS entry: expected credential=bearer_id`;
    }

    if (mappings.has(credential)) {
      return "Duplicate credential in FUDA_STATIC_SUBJECT_MAPPINGS";
    }

    mappings.set(credential, bearerId);
  }

  return { mappings };
}
