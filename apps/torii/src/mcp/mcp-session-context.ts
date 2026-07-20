import { AsyncLocalStorage } from "node:async_hooks";

const storage = new AsyncLocalStorage<string>();

export function getMcpSessionId(): string {
  const sessionId = storage.getStore();
  if (!sessionId) {
    throw new Error("McpSessionId not set on request context");
  }
  return sessionId;
}

export function tryGetMcpSessionId(): string | undefined {
  return storage.getStore();
}

export function runWithMcpSessionId<T>(sessionId: string, fn: () => T): T;
export function runWithMcpSessionId<T>(
  sessionId: string,
  fn: () => Promise<T>,
): Promise<T>;
export function runWithMcpSessionId<T>(
  sessionId: string,
  fn: () => T | Promise<T>,
): T | Promise<T> {
  return storage.run(sessionId, fn);
}
