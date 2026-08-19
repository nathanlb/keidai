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
  async pollRemoteUpdates(): Promise<void> {
    const watermarks = await this.repository.listRunWatermarks();
    const isFirst = !this.watermarksReady;
    for (const row of watermarks) {
      const previous = this.lastSeenUpdatedAt.get(row.id);
      if (previous === row.updatedAt) {
        continue;
      }
      this.lastSeenUpdatedAt.set(row.id, row.updatedAt);
      if (!isFirst) {
        await this.notifyUpdated(row.id);
      }
    }
    this.watermarksReady = true;
  }

  async createRun(input: Parameters<RunRepository["create"]>[0]) {
    const run = await this.repository.create(input);
    await this.notifyUpdated(run.id);
    return projectRunListItem(run);
  }

  async appendStep(
    runId: string,
    step: Omit<RunStep, "id"> & { id?: string },
  ) {
    const run = await this.repository.appendStep(runId, createRunStep(step));
    if (run) {
      await this.notifyUpdated(runId);
    }
    return run;
  }

  async completeRun(
    runId: string,
    input: Parameters<RunRepository["complete"]>[1],
  ) {
    const run = await this.repository.complete(runId, input);
    if (run) {
      await this.notifyUpdated(runId);
    }
    return run;
  }

  setConversationHistory(
    runId: string,
    history: readonly ConversationEntry[],
  ): Promise<boolean> {
    return this.repository.setConversationHistory(runId, history);
  }

  getConversationHistory(runId: string): Promise<ConversationEntry[] | null> {
    return this.repository.getConversationHistory(runId);
  }

  setParkedMcpTask(
    runId: string,
    parked: Omit<ParkedMcpTask, "runId">,
  ): Promise<boolean> {
    return this.repository.setParkedMcpTask(runId, parked);
  }

  clearParkedMcpTask(runId: string): Promise<boolean> {
    return this.repository.clearParkedMcpTask(runId);
  }

  getParkedMcpTask(runId: string): Promise<ParkedMcpTask | null> {
    return this.repository.getParkedMcpTask(runId);
  }

  listParkedMcpTasks(): Promise<ParkedMcpTask[]> {
    return this.repository.listParkedMcpTasks();
  }

  listClaimableParkedMcpTasks(nowIso: string): Promise<ParkedMcpTask[]> {
    return this.repository.listClaimableParkedMcpTasks(nowIso);
  }

  async enqueueParkedFollowUp(
    runId: string,
    message: string,
    userMessageStep: RunStep,
  ): Promise<boolean> {
    const queued = await this.repository.enqueueParkedFollowUp(
      runId,
      message,
      userMessageStep,
    );
    if (queued) {
      await this.notifyUpdated(runId);
    }
    return queued;
  }

  drainParkedFollowUps(runId: string): Promise<ConversationEntry[]> {
    return this.repository.drainParkedFollowUps(runId);
  }

  claimRun(
    runId: string,
    ownerId: string,
    leaseExpiresAt: string,
    nowIso: string,
  ): Promise<boolean> {
    return this.repository.claimRun(runId, ownerId, leaseExpiresAt, nowIso);
  }

  renewRunLease(
    runId: string,
    ownerId: string,
    leaseExpiresAt: string,
  ): Promise<boolean> {
    return this.repository.renewRunLease(runId, ownerId, leaseExpiresAt);
  }

  releaseRun(runId: string, ownerId: string): Promise<boolean> {
    return this.repository.releaseRun(runId, ownerId);
  }

  async beginContinuation(
    runId: string,
    message: string,
    userMessageStep: RunStep,
  ): Promise<BeginContinuationResult> {
    const result = await this.repository.beginContinuation(
      runId,
      message,
      userMessageStep,
    );
    if (result.ok) {
      await this.notifyUpdated(runId);
    }
    return result;
  }

  private async notifyUpdated(runId: string): Promise<void> {
    const run = await this.repository.get(runId);
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
