import { randomUUID } from "node:crypto";
import type { RunStore } from "../runs/run-store.js";

export const DEFAULT_RUN_LEASE_MS = 15_000;
export const DEFAULT_PARKED_RECLAIM_INTERVAL_MS = 5_000;
export const DEFAULT_RUN_EVENT_POLL_INTERVAL_MS = 1_000;

export class RunNotClaimedError extends Error {
  readonly code = "run_not_claimed" as const;

  constructor(runId: string) {
    super(`run ${runId} is already claimed by another replica`);
    this.name = "RunNotClaimedError";
  }
}

export class RunLeaseLostError extends Error {
  readonly code = "run_lease_lost" as const;

  constructor(runId: string) {
    super(`lost run lease for ${runId}`);
    this.name = "RunLeaseLostError";
  }
}

export function isRunLeaseError(error: unknown): boolean {
  return (
    error instanceof RunNotClaimedError || error instanceof RunLeaseLostError
  );
}

export function resolveReplicaId(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.SHAIDEN_REPLICA_ID?.trim();
  return configured && configured.length > 0 ? configured : randomUUID();
}

export function leaseExpiresAt(nowMs: number, ttlMs: number): string {
  return new Date(nowMs + ttlMs).toISOString();
}

/**
 * Renews the lease on an interval. Calls `onLost` once if a renew fails
 * (another replica claimed after expiry, or the run left `running`).
 */
export function startRunLeaseHeartbeat(input: {
  runStore: RunStore;
  runId: string;
  replicaId: string;
  leaseMs: number;
  now?: () => number;
  onLost: () => void;
}): () => void {
  const now = input.now ?? Date.now;
  const intervalMs = Math.max(1, Math.floor(input.leaseMs / 3));
  let lost = false;
  const timer = setInterval(() => {
    if (lost) {
      return;
    }
    const expires = leaseExpiresAt(now(), input.leaseMs);
    if (
      !input.runStore.renewRunLease(input.runId, input.replicaId, expires)
    ) {
      lost = true;
      input.onLost();
    }
  }, intervalMs);
  timer.unref();
  return () => {
    clearInterval(timer);
  };
}
