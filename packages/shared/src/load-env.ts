import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

const WORKSPACE_MARKER = "pnpm-workspace.yaml";

export function findRepoRoot(startDir: string): string | null {
  let dir = path.resolve(startDir);

  while (dir !== path.dirname(dir)) {
    if (existsSync(path.join(dir, WORKSPACE_MARKER))) {
      return dir;
    }
    dir = path.dirname(dir);
  }

  return null;
}

/**
 * Load environment variables for a runnable package:
 * 1. repo root `.env` (shared dev secrets)
 * 2. package `.env` (overrides + app-specific)
 */
export function loadEnvForPackage(entryFileUrl: string | URL): void {
  const packageRoot = path.resolve(
    path.dirname(fileURLToPath(entryFileUrl)),
    "..",
  );
  const repoRoot = findRepoRoot(packageRoot);

  if (repoRoot) {
    config({ path: path.join(repoRoot, ".env") });
  }

  config({ path: path.join(packageRoot, ".env"), override: true });
}
