import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { SigningKeyMaterialSource } from "../types/signing-key-config.js";

/** Resolves private-key PEM from a file path or environment variable. */
export function loadSigningKeyMaterial(
  source: SigningKeyMaterialSource,
  env: NodeJS.ProcessEnv = process.env,
  cwd: string = process.cwd(),
): string {
  if (source.kind === "env") {
    const pem = env[source.name];
    if (pem === undefined || pem.trim() === "") {
      throw new Error(
        `Signing key env ${source.name} is missing or empty`,
      );
    }
    return pem;
  }

  const absolutePath = resolve(cwd, source.path);
  try {
    return readFileSync(absolutePath, "utf8");
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Failed to read signing key file ${absolutePath}: ${reason}`,
    );
  }
}
