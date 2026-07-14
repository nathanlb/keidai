import { mkdirSync } from "node:fs";
import path from "node:path";

const DEFAULT_DB_PATH = "./data/shaiden.db";

export function resolveShaidenDbPath(): string {
  const configured = process.env.SHAIDEN_DB_PATH?.trim();
  const resolved = path.resolve(configured || DEFAULT_DB_PATH);
  mkdirSync(path.dirname(resolved), { recursive: true });
  return resolved;
}
