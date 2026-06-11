import type { CredentialStrategy, PolicyAction } from "./config.js";

export type TracePhase =
  | "tools/list"
  | "tools/call"
  | "policy"
  | "credential"
  | "route"
  | "backend";

/** Structured trace record emitted per MCP request. */
export interface TraceRecord {
  traceId: string;
  timestamp: string;
  phase: TracePhase;
  method?: string;
  tool?: string;
  server?: string;
  durationMs?: number;
  principal?: string;
  credentialStrategy?: CredentialStrategy;
  policyDecision?: PolicyAction;
  error?: string;
  metadata?: Record<string, unknown>;
}

export interface TraceEmitter {
  emit(record: TraceRecord): void;
}

/** Cache interface — in-memory v0 impl; Redis slots in later. */
export interface CacheStore {
  get<T>(key: string): T | undefined;
  set<T>(key: string, value: T): void;
  delete(key: string): void;
  clear(): void;
}

export class InMemoryCacheStore implements CacheStore {
  private readonly store = new Map<string, unknown>();

  get<T>(key: string): T | undefined {
    return this.store.get(key) as T | undefined;
  }

  set<T>(key: string, value: T): void {
    this.store.set(key, value);
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }
}
