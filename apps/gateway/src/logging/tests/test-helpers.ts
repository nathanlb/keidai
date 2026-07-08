import type { Logger } from "@keidai/shared";
import { CapturingLogger } from "./capturing-logger.js";

export function createNoopLogger(): Logger {
  const noop = () => {};
  return { debug: noop, info: noop, warn: noop, error: noop };
}

export function createCapturingLogger(): CapturingLogger {
  return new CapturingLogger();
}
