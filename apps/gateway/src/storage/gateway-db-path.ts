import { mkdirSync } from "node:fs";
import path from "node:path";

const DEFAULT_DB_PATH = "./data/torii.db";

export function resolveGatewayDbPath(): string {
  const configured = process.env.TORII_DB_PATH?.trim();
  const resolved = path.resolve(configured || DEFAULT_DB_PATH);
  mkdirSync(path.dirname(resolved), { recursive: true });
  return resolved;
}
