import type {
  SigningKeyConfigEntry,
  SigningKeyMaterialSource,
  SigningKeysConfig,
} from "../types/signing-key-config.js";

/**
 * Parses `FUDA_SIGNING_KEYS` and `FUDA_SIGNING_KID`.
 *
 * Format: `kid=source,kid=source`
 * - `source` is a filesystem path to a PEM private key, or
 * - `env:VAR_NAME` to read PEM from another environment variable
 */
export function parseSigningKeysEnv(
  rawKeys: string | undefined,
  rawSigningKid: string | undefined,
): SigningKeysConfig | string {
  if (rawKeys === undefined || rawKeys.trim() === "") {
    return "FUDA_SIGNING_KEYS is required (kid=path or kid=env:VAR_NAME, comma-separated)";
  }

  const parts = rawKeys
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  if (parts.length === 0) {
    return "FUDA_SIGNING_KEYS must list at least one key";
  }

  const keys: SigningKeyConfigEntry[] = [];
  const seenKids = new Set<string>();

  for (const part of parts) {
    const eq = part.indexOf("=");
    if (eq <= 0 || eq === part.length - 1) {
      return `Invalid FUDA_SIGNING_KEYS entry: ${part} (expected kid=path or kid=env:VAR)`;
    }

    const kid = part.slice(0, eq).trim();
    const sourceRaw = part.slice(eq + 1).trim();
    if (kid.length === 0 || sourceRaw.length === 0) {
      return `Invalid FUDA_SIGNING_KEYS entry: ${part} (expected kid=path or kid=env:VAR)`;
    }

    if (seenKids.has(kid)) {
      return `Duplicate kid in FUDA_SIGNING_KEYS: ${kid}`;
    }
    seenKids.add(kid);

    const material = parseMaterialSource(sourceRaw);
    if (typeof material === "string") {
      return material;
    }

    keys.push({ kid, material });
  }

  const signingKid = rawSigningKid?.trim() ?? "";
  if (signingKid.length === 0) {
    return "FUDA_SIGNING_KID is required (must match a kid in FUDA_SIGNING_KEYS)";
  }

  if (!seenKids.has(signingKid)) {
    return `FUDA_SIGNING_KID "${signingKid}" is not listed in FUDA_SIGNING_KEYS`;
  }

  return { keys, signingKid };
}

function parseMaterialSource(sourceRaw: string): SigningKeyMaterialSource | string {
  if (sourceRaw.startsWith("env:")) {
    const name = sourceRaw.slice("env:".length).trim();
    if (name.length === 0) {
      return "Invalid FUDA_SIGNING_KEYS env source (expected env:VAR_NAME)";
    }
    return { kind: "env", name };
  }

  return { kind: "file", path: sourceRaw };
}
