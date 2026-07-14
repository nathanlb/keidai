import type { RunSseEvent } from "@keidai/shared";
import { RUN_SSE_EVENT } from "@keidai/shared";
import { InMemoryRunRepository, createRunStep } from "./in-memory-run-repository.js";
import type { RunRepository } from "./types/run-repository.js";
import { projectRunListItem } from "./utils/project-run-api.js";

type RunListener = (event: RunSseEvent) => void;

/**
 * Shaiden-owned run visibility store: local writes from the harness plus
 * read/SSE fan-out for keidai-ui.
 */
export class RunStore {
  private readonly listeners = new Set<RunListener>();

  constructor(private readonly repository: RunRepository = new InMemoryRunRepository()) {}

  listRuns(limit?: number) {
    return this.repository.list(limit);
  }

  getRun(runId: string) {
    return this.repository.get(runId);
  }

  subscribe(listener: RunListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  createRun(input: Parameters<RunRepository["create"]>[0]) {
    const run = this.repository.create(input);
    this.notifyUpdated(run.id);
    return projectRunListItem(run);
  }

  appendStep(
    runId: string,
    step: Omit<Parameters<RunRepository["appendStep"]>[1], "id"> & { id?: string },
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
