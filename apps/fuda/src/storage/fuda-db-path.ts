import { mkdirSync } from "node:fs";
import path from "node:path";

const DEFAULT_DB_PATH = "./data/fuda.db";

export function resolveFudaDbPath(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const configured = env.FUDA_DB_PATH?.trim();
  const resolved = path.resolve(configured || DEFAULT_DB_PATH);
  mkdirSync(path.dirname(resolved), { recursive: true });
  return resolved;
}
