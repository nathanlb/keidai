import { mkdirSync } from "node:fs";
import path from "node:path";

const DEFAULT_TOKEN_STORE_PATH = "./data/torii-tokens.db";

export function resolveTokenStorePath(): string {
  const configured = process.env.TORII_TOKEN_STORE_PATH?.trim();
  const resolved = path.resolve(configured || DEFAULT_TOKEN_STORE_PATH);
  mkdirSync(path.dirname(resolved), { recursive: true });
  return resolved;
}
