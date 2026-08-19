import { AsyncLocalStorage } from "node:async_hooks";
import type { Queryable } from "@keidai/postgres";

const queryableStorage = new AsyncLocalStorage<Queryable>();

export function runWithQueryable<T>(queryable: Queryable, fn: () => T): T {
  return queryableStorage.run(queryable, fn);
}

export function resolveQueryable(fallback: Queryable): Queryable {
  return queryableStorage.getStore() ?? fallback;
}
