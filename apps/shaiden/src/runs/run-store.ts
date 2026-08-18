import type { RunSseEvent, RunStep } from "@keidai/shared";
import { RUN_SSE_EVENT } from "@keidai/shared";
import type { ConversationEntry } from "../run/types/conversation-history.js";
import type { ParkedMcpTask, RunRepository } from "./types/run-repository.js";
import type { BeginContinuationResult } from "./utils/conversation-history.js";
import { createRunStep } from "./utils/create-run-step.js";
import { projectRunListItem } from "./utils/project-run-api.js";

type RunListener = (event: RunSseEvent) => void;

/**
 * Shaiden-owned run visibility store: local writes from the harness plus
 * read/SSE fan-out for keidai-ui. Follow-up queues and run leases live in the
 * repository so another replica can accept a parked follow-up or claim a
 * parked run. Process-local listeners are also fed by polling watermarks so
 * an SSE client on this replica sees writes from other replicas.
 */
export class RunStore {
  private readonly listeners = new Set<RunListener>();
  private readonly lastSeenUpdatedAt = new Map<string, string>();
  private watermarksReady = false;

  constructor(private readonly repository: RunRepository) {}

  listRuns(limit?: number) {
    return this.repository.list(limit);
  }

  getRun(runId: string) {
    return this.repository.get(runId);
  }

  listRunningRuns() {
    return this.repository.listRunningRuns();
  }

  subscribe(listener: RunListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Snapshot watermarks on the first call; later calls notify listeners when
   * a run's `updatedAt` changes (including runs created on another replica).
   */
  pollRemoteUpdates(): void {
    const watermarks = this.repository.listRunWatermarks();
    const isFirst = !this.watermarksReady;
    for (const row of watermarks) {
      const previous = this.lastSeenUpdatedAt.get(row.id);
      if (previous === row.updatedAt) {
        continue;
      }
      this.lastSeenUpdatedAt.set(row.id, row.updatedAt);
      if (!isFirst) {
        this.notifyUpdated(row.id);
      }
    }
    this.watermarksReady = true;
  }

  createRun(input: Parameters<RunRepository["create"]>[0]) {
    const run = this.repository.create(input);
    this.notifyUpdated(run.id);
    return projectRunListItem(run);
  }

  appendStep(
    runId: string,
    step: Omit<RunStep, "id"> & { id?: string },
  ) {
    const run = this.repository.appendStep(runId, createRunStep(step));
    if (run) {
      this.notifyUpdated(runId);
    }
    return run;
  }

  completeRun(runId: string, input: Parameters<RunRepository["complete"]>[1]) {
    const run = this.repository.complete(runId, input);
    if (run) {
      this.notifyUpdated(runId);
    }
    return run;
  }

  setConversationHistory(
    runId: string,
    history: readonly ConversationEntry[],
  ): boolean {
    return this.repository.setConversationHistory(runId, history);
  }

  getConversationHistory(runId: string): ConversationEntry[] | null {
    return this.repository.getConversationHistory(runId);
  }

  setParkedMcpTask(
    runId: string,
    parked: Omit<ParkedMcpTask, "runId">,
  ): boolean {
    return this.repository.setParkedMcpTask(runId, parked);
  }

  clearParkedMcpTask(runId: string): boolean {
    return this.repository.clearParkedMcpTask(runId);
  }

  getParkedMcpTask(runId: string): ParkedMcpTask | null {
    return this.repository.getParkedMcpTask(runId);
  }

  listParkedMcpTasks(): ParkedMcpTask[] {
    return this.repository.listParkedMcpTasks();
  }

  listClaimableParkedMcpTasks(nowIso: string): ParkedMcpTask[] {
    return this.repository.listClaimableParkedMcpTasks(nowIso);
  }

  enqueueParkedFollowUp(
    runId: string,
    message: string,
    userMessageStep: RunStep,
  ): boolean {
    const queued = this.repository.enqueueParkedFollowUp(
      runId,
      message,
      userMessageStep,
    );
    if (queued) {
      this.notifyUpdated(runId);
    }
    return queued;
  }

  drainParkedFollowUps(runId: string): ConversationEntry[] {
    return this.repository.drainParkedFollowUps(runId);
  }

  claimRun(
    runId: string,
    ownerId: string,
    leaseExpiresAt: string,
    nowIso: string,
  ): boolean {
    return this.repository.claimRun(runId, ownerId, leaseExpiresAt, nowIso);
  }

  renewRunLease(
    runId: string,
    ownerId: string,
    leaseExpiresAt: string,
  ): boolean {
    return this.repository.renewRunLease(runId, ownerId, leaseExpiresAt);
  }

  releaseRun(runId: string, ownerId: string): boolean {
    return this.repository.releaseRun(runId, ownerId);
  }

  beginContinuation(
    runId: string,
    message: string,
    userMessageStep: RunStep,
  ): BeginContinuationResult {
    const result = this.repository.beginContinuation(
      runId,
      message,
      userMessageStep,
    );
    if (result.ok) {
      this.notifyUpdated(runId);
    }
    return result;
  }

  private notifyUpdated(runId: string): void {
    const run = this.repository.get(runId);
    if (!run) {
      return;
    }

    const event: RunSseEvent = {
      type: RUN_SSE_EVENT.runUpdated,
      run,
    };

    for (const listener of this.listeners) {
      listener(event);
    }
  }
}
