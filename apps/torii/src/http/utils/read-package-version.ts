import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

export function readPackageVersion(): string {
  const { version } = require("../../../package.json") as { version: string };
  return version;
}
