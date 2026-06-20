import { AsyncLocalStorage } from "node:async_hooks";
import type { AgentPrincipal } from "@torii/shared";

const storage = new AsyncLocalStorage<AgentPrincipal>();

export function getAgentPrincipal(): AgentPrincipal {
  const principal = storage.getStore();
  if (!principal) {
    throw new Error("AgentPrincipal not set on request context");
  }
  return principal;
}

export function tryGetAgentPrincipal(): AgentPrincipal | undefined {
  return storage.getStore();
}

export function runWithAgentPrincipal<T>(
  principal: AgentPrincipal,
  fn: () => T,
): T;
export function runWithAgentPrincipal<T>(
  principal: AgentPrincipal,
  fn: () => Promise<T>,
): Promise<T>;
export function runWithAgentPrincipal<T>(
  principal: AgentPrincipal,
  fn: () => T | Promise<T>,
): T | Promise<T> {
  return storage.run(principal, fn);
}
